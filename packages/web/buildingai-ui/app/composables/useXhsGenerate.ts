import type { GenerateNoteDto } from '@/types/xhs'
import type { AiModel } from '@buildingai/service/webapi/ai-conversation'

/**
 * XHS笔记生成组合式函数
 * 提供笔记生成相关的状态管理和方法
 */
export const useXhsGenerate = () => {
  // 全局状态管理
  const controlsStore = useControlsStore()
  const userStore = useUserStore()

  // 响应式状态
  const content = ref('')
  const mode = ref<'ai-generate' | 'ai-compose' | 'add-emoji'>('ai-generate')
  const generatedTitle = ref('')
  const generatedContent = ref('')
  const isGenerating = ref(false)
  const generationError = ref('')
  const generationProgress = ref('')

  // 使用全局状态中的选中模型
  const selectedModel = computed(() => controlsStore.selectedModel)

  // Toast 通知
  const toast = useMessage()

  // 输入验证
  const isInputEmpty = computed(() => content.value.trim() === '')
  const characterCount = computed(() => content.value.length)

  // 清空输入
  const clearInput = () => {
    content.value = ''
    generationError.value = ''
  }

  // 清空生成结果
  const clearGenerated = () => {
    generatedTitle.value = ''
    generatedContent.value = ''
    generationError.value = ''
    generationProgress.value = ''
  }

  // 输入验证函数
  const validateInput = (): boolean => {
    // 清除之前的错误
    generationError.value = ''

    console.log('当前mode值:', mode.value)
    console.log('当前content值:', content.value)
    console.log('当前selectedModel值:', selectedModel.value)
    console.log('selectedModel.value?.id:', selectedModel.value?.id)

    if (isInputEmpty.value) {
      generationError.value = '请输入内容'
      toast.error('请输入内容')
      return false
    }

    if (content.value.length > 2000) {
      generationError.value = '输入内容不能超过2000个字符'
      toast.error('输入内容不能超过2000个字符')
      return false
    }

    // 检查是否只包含空白字符
    if (!/.*\S.*/.test(content.value)) {
      generationError.value = '输入内容不能只包含空白字符，请输入有效内容'
      toast.error('输入内容不能只包含空白字符，请输入有效内容')
      return false
    }

    // 检查是否选择了模型
    if (!selectedModel.value?.id) {
      generationError.value = '请选择AI模型'
      toast.error('请选择AI模型')
      console.error('模型验证失败 - selectedModel.value:', selectedModel.value)
      console.error('模型验证失败 - selectedModel.value?.id:', selectedModel.value?.id)
      return false
    }

    return true
  }

  // 生成笔记内容
  const generate = async (): Promise<void> => {
    // 输入验证
    if (!validateInput()) {
      return
    }

    // 重置状态
    clearGenerated()
    isGenerating.value = true
    generationError.value = ''
    generationProgress.value = '正在连接AI服务...'

    let eventSource: EventSource | null = null

    try {
      // 准备请求数据
      const generateDto: GenerateNoteDto = {
        content: content.value.trim(),
        mode: mode.value,
        // 添加模型ID到请求中
        aiModel: selectedModel.value?.id
      }

      // 调试日志
      console.log('发送的数据:', generateDto)
      console.log('选中的模型:', selectedModel.value)
      console.log('模型ID:', selectedModel.value?.id)
      console.log('模型ID类型:', typeof selectedModel.value?.id)
      console.log('controlsStore.selectedModel:', controlsStore.selectedModel)

      // 创建EventSource连接
      const url = new URL('/api/xhs/generate', window.location.origin)
      
      // 获取认证token
      const authToken = userStore.token || userStore.temporaryToken
      if (!authToken) {
        generationError.value = '请先登录'
        toast.error('请先登录')
        return
      }

      // 由于EventSource不支持POST请求体，我们需要使用fetch进行流式处理
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(generateDto)
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '生成失败，请稍后重试'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      if (!response.body) {
        throw new Error('响应体为空')
      }

      // 处理流式响应
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      generationProgress.value = '开始生成内容...'

      // 设置超时处理
      const timeoutId = setTimeout(() => {
        reader.cancel()
        throw new Error('生成超时，请稍后重试')
      }, 30000) // 30秒超时

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            break
          }

          // 解码数据块
          buffer += decoder.decode(value, { stream: true })
          
          // 处理完整的事件
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留不完整的行

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6) // 移除 'data: ' 前缀
              
              if (data === '[DONE]') {
                // 生成完成
                clearTimeout(timeoutId)
                isGenerating.value = false
                generationProgress.value = '生成完成'
                return
              }

              try {
                const event = JSON.parse(data)
                await handleStreamEvent(event)
              } catch (parseError) {
                console.warn('解析事件数据失败:', parseError, 'Data:', data)
              }
            }
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }

    } catch (error) {
      console.error('生成失败:', error)
      handleGenerationError(error)
    } finally {
      isGenerating.value = false
      if (eventSource) {
        eventSource.close()
      }
    }
  }

  // 处理流式事件
  const handleStreamEvent = async (event: any): Promise<void> => {
    switch (event.type) {
      case 'start':
        generationProgress.value = event.message || '开始生成内容...'
        break

      case 'chunk':
        // 实时追加内容块
        if (event.data) {
          // 解析标题和正文
          const fullContent = generatedTitle.value + generatedContent.value + event.data
          parseGeneratedContent(fullContent)
          
          // 更新进度
          generationProgress.value = '正在生成内容...'
        }
        break

      case 'complete':
        generationProgress.value = event.message || '生成完成'
        if (event.fullContent) {
          parseGeneratedContent(event.fullContent)
        }
        break

      case 'error':
        throw new Error(event.message || '生成失败')

      default:
        console.warn('未知事件类型:', event.type)
    }
  }

  // 解析生成的内容，分离标题和正文
  const parseGeneratedContent = (fullContent: string): void => {
    const lines = fullContent.split('\n')
    let title = ''
    let content = ''
    let isContentSection = false

    for (const line of lines) {
      const trimmedLine = line.trim()
      
      if (trimmedLine.startsWith('标题：') || trimmedLine.startsWith('标题:')) {
        title = trimmedLine.replace(/^标题[：:]/, '').trim()
      } else if (trimmedLine.startsWith('正文：') || trimmedLine.startsWith('正文:')) {
        content = trimmedLine.replace(/^正文[：:]/, '').trim()
        isContentSection = true
      } else if (isContentSection && trimmedLine) {
        content += (content ? '\n' : '') + trimmedLine
      } else if (!title && !isContentSection && trimmedLine) {
        // 如果还没有找到标题标记，将第一行作为标题
        title = trimmedLine
      }
    }

    generatedTitle.value = title
    generatedContent.value = content
  }

  // 处理生成错误
  const handleGenerationError = (error: any): void => {
    let errorMessage = '生成失败，请稍后重试'
    const errorMsg = error?.message || ''
    
    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
      errorMessage = '生成超时，请稍后重试'
    } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
      errorMessage = '网络连接失败，请检查网络后重试'
    } else if (errorMsg.includes('输入内容')) {
      errorMessage = errorMsg
    } else if (errorMsg.includes('AI服务')) {
      errorMessage = 'AI服务暂时不可用，请稍后重试'
    } else if (errorMsg) {
      errorMessage = errorMsg
    }

    generationError.value = errorMessage
    generationProgress.value = ''

    toast.error(errorMessage)
  }

  // 重新生成
  const regenerate = async (): Promise<void> => {
    await generate()
  }

  // 保存笔记
  const save = async (): Promise<void> => {
    // 验证是否有生成的内容
    if (!generatedTitle.value && !generatedContent.value) {
      toast.error('没有可保存的内容')
      return
    }

    // 验证标题和内容不为空
    if (!generatedTitle.value.trim()) {
      toast.error('标题不能为空')
      return
    }

    if (!generatedContent.value.trim()) {
      toast.error('正文内容不能为空')
      return
    }

    try {
      // 获取认证token
      const authToken = userStore.token || userStore.temporaryToken
      if (!authToken) {
        toast.error('请先登录')
        return
      }

      // 准备保存数据
      const createNoteDto = {
        title: generatedTitle.value.trim(),
        content: generatedContent.value.trim(),
        mode: mode.value,
        originalInput: content.value.trim() || undefined
      }

      // 调用API保存笔记
      const response = await fetch('/api/xhs/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(createNoteDto)
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '保存失败，请稍后重试'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const savedNote = await response.json()
      
      // 显示成功提示
      toast.success('笔记保存成功')
      
      // 可选：清空生成结果或跳转到笔记列表
      // clearGenerated()
      
      console.log('保存的笔记:', savedNote)
      
    } catch (error: any) {
      console.error('保存笔记失败:', error)
      
      let errorMessage = '保存失败，请稍后重试'
      const errorMsg = error?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('标题') || errorMsg.includes('内容')) {
        errorMessage = errorMsg
      } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
    }
  }

  // 复制标题到剪贴板
  const copyTitle = async (): Promise<void> => {
    if (!generatedTitle.value) {
      toast.error('没有可复制的标题')
      return
    }

    try {
      await navigator.clipboard.writeText(generatedTitle.value)
      toast.success('标题已复制到剪贴板')
    } catch (error: any) {
      console.error('复制标题失败:', error)
      toast.error('无法访问剪贴板')
    }
  }

  // 复制正文到剪贴板
  const copyContent = async (): Promise<void> => {
    if (!generatedContent.value) {
      toast.error('没有可复制的正文')
      return
    }

    try {
      await navigator.clipboard.writeText(generatedContent.value)
      toast.success('正文已复制到剪贴板')
    } catch (error: any) {
      console.error('复制正文失败:', error)
      toast.error('无法访问剪贴板')
    }
  }

  return {
    // 状态
    content,
    mode,
    generatedTitle,
    generatedContent,
    isGenerating,
    generationError,
    generationProgress,
    isInputEmpty,
    characterCount,
    selectedModel,

    // 方法
    generate,
    regenerate,
    save,
    clearInput,
    clearGenerated,
    copyTitle,
    copyContent,
    validateInput
  }
}
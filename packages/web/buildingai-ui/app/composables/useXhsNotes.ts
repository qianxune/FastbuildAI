import type { XhsNote, PaginatedResponse } from '@/types/xhs'

/**
 * XHS笔记管理组合式函数
 * 提供笔记列表管理相关的状态管理和方法
 */
export const useXhsNotes = () => {
  // 全局状态管理 - useUserStore 由 Nuxt 自动导入
  const userStore = useUserStore()

  // 响应式状态
  const notes = ref<XhsNote[]>([])
  const currentPage = ref(1)
  const total = ref(0)
  const totalPages = ref(0)
  const limit = ref(20)
  const isLoading = ref(false)
  const error = ref('')
  const searchKeyword = ref('')
  const selectedGroupId = ref<string | undefined>(undefined)

  // Toast 通知
  const toast = useMessage()

  // 获取认证token
  const getAuthToken = () => {
    const authToken = userStore.token || userStore.temporaryToken
    if (!authToken) {
      throw new Error('请先登录')
    }
    return authToken
  }

  // 获取笔记列表
  const fetchNotes = async (groupId?: string, page: number = 1): Promise<void> => {
    isLoading.value = true
    error.value = ''

    try {
      const authToken = getAuthToken()

      // 构建查询参数
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.value.toString(),
      })

      if (groupId) {
        queryParams.append('groupId', groupId)
        selectedGroupId.value = groupId
      }

      // 调用API
      const response = await fetch(`/api/xhs/notes?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '获取笔记列表失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const responseData = await response.json()
      
      // API 返回格式: { code, message, data: { items, total, ... } }
      const result: PaginatedResponse<XhsNote> = responseData.data || responseData
      
      // 更新状态
      notes.value = result.items || []
      total.value = result.total || 0
      totalPages.value = result.totalPages || 0
      currentPage.value = result.page || page
      
    } catch (err: any) {
      console.error('获取笔记列表失败:', err)
      
      let errorMessage = '获取笔记列表失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      error.value = errorMessage
      toast.error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  // 搜索笔记
  const searchNotes = async (keyword: string): Promise<void> => {
    if (!keyword.trim()) {
      // 如果搜索关键词为空，重新获取所有笔记
      searchKeyword.value = ''
      await fetchNotes(selectedGroupId.value, 1)
      return
    }

    isLoading.value = true
    error.value = ''
    searchKeyword.value = keyword

    try {
      const authToken = getAuthToken()

      // 构建查询参数
      const queryParams = new URLSearchParams({
        keyword: keyword.trim(),
      })

      // 调用搜索API
      const response = await fetch(`/api/xhs/notes/search?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '搜索失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const responseData = await response.json()
      
      // API 返回格式: { code, message, data: { items, total, ... } }
      const result: PaginatedResponse<XhsNote> = responseData.data || responseData
      
      // 更新状态
      notes.value = result.items || []
      total.value = result.total || 0
      totalPages.value = result.totalPages || 0
      currentPage.value = 1 // 搜索结果重置到第一页
      
    } catch (err: any) {
      console.error('搜索笔记失败:', err)
      
      let errorMessage = '搜索失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      error.value = errorMessage
      toast.error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  // 删除单个笔记
  const deleteNote = async (id: string): Promise<void> => {
    try {
      const authToken = getAuthToken()

      // 调用删除API
      const response = await fetch(`/api/xhs/notes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '删除失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      // 从本地状态中移除已删除的笔记
      notes.value = notes.value.filter(note => note.id !== id)
      total.value = Math.max(0, total.value - 1)
      
      toast.success('笔记删除成功')
      
      // 如果当前页没有笔记了，且不是第一页，则跳转到上一页
      if (notes.value.length === 0 && currentPage.value > 1) {
        await fetchNotes(selectedGroupId.value, currentPage.value - 1)
      }
      
    } catch (err: any) {
      console.error('删除笔记失败:', err)
      
      let errorMessage = '删除失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (errorMsg.includes('不存在') || errorMsg.includes('not found')) {
        errorMessage = '笔记不存在或已被删除'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
      throw err // 重新抛出错误，让调用方处理
    }
  }

  // 批量删除笔记
  const batchDelete = async (ids: string[]): Promise<void> => {
    if (!ids.length) {
      toast.error('请选择要删除的笔记')
      return
    }

    try {
      const authToken = getAuthToken()

      // 调用批量删除API
      const response = await fetch('/api/xhs/notes/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          ids: ids
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '批量删除失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      // 从本地状态中移除已删除的笔记
      notes.value = notes.value.filter(note => !ids.includes(note.id))
      total.value = Math.max(0, total.value - result.affected)
      
      toast.success(result.message || `成功删除 ${result.affected} 个笔记`)
      
      // 如果当前页没有笔记了，且不是第一页，则跳转到上一页
      if (notes.value.length === 0 && currentPage.value > 1) {
        await fetchNotes(selectedGroupId.value, currentPage.value - 1)
      }
      
    } catch (err: any) {
      console.error('批量删除笔记失败:', err)
      
      let errorMessage = '批量删除失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
      throw err // 重新抛出错误，让调用方处理
    }
  }

  // 批量移动笔记
  const batchMove = async (ids: string[], groupId: string): Promise<void> => {
    if (!ids.length) {
      toast.error('请选择要移动的笔记')
      return
    }

    if (!groupId) {
      toast.error('请选择目标分组')
      return
    }

    try {
      const authToken = getAuthToken()

      // 调用批量移动API
      const response = await fetch('/api/xhs/notes/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'move',
          ids: ids,
          groupId: groupId
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '批量移动失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      // 更新本地状态中的笔记分组
      notes.value = notes.value.map(note => {
        if (ids.includes(note.id)) {
          return { ...note, groupId }
        }
        return note
      })
      
      toast.success(result.message || `成功移动 ${result.affected} 个笔记`)
      
    } catch (err: any) {
      console.error('批量移动笔记失败:', err)
      
      let errorMessage = '批量移动失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('网络') || errorMsg.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
      throw err // 重新抛出错误，让调用方处理
    }
  }

  // 切换页面
  const changePage = async (page: number): Promise<void> => {
    if (page < 1 || page > totalPages.value) {
      return
    }

    if (searchKeyword.value) {
      // 如果是搜索状态，搜索不支持分页，直接返回
      return
    }

    await fetchNotes(selectedGroupId.value, page)
  }

  // 刷新当前页面
  const refresh = async (): Promise<void> => {
    if (searchKeyword.value) {
      await searchNotes(searchKeyword.value)
    } else {
      await fetchNotes(selectedGroupId.value, currentPage.value)
    }
  }

  // 清空搜索
  const clearSearch = async (): Promise<void> => {
    searchKeyword.value = ''
    await fetchNotes(selectedGroupId.value, 1)
  }

  // 计算属性
  const isEmpty = computed(() => notes.value.length === 0)
  const isSearching = computed(() => !!searchKeyword.value)
  const hasNextPage = computed(() => currentPage.value < totalPages.value)
  const hasPrevPage = computed(() => currentPage.value > 1)

  return {
    // 状态
    notes,
    currentPage,
    total,
    totalPages,
    limit,
    isLoading,
    error,
    searchKeyword,
    selectedGroupId,

    // 计算属性
    isEmpty,
    isSearching,
    hasNextPage,
    hasPrevPage,

    // 方法
    fetchNotes,
    searchNotes,
    deleteNote,
    batchDelete,
    batchMove,
    changePage,
    refresh,
    clearSearch
  }
}
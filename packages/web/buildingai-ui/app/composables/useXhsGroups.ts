import type { XhsGroup } from '@/types/xhs'

/**
 * XHS分组管理组合式函数
 * 提供分组管理相关的状态管理和方法
 */
export const useXhsGroups = () => {
  // 全局状态管理 - useUserStore 由 Nuxt 自动导入
  const userStore = useUserStore()

  // 响应式状态
  const groups = ref<XhsGroup[]>([])
  const isLoading = ref(false)
  const error = ref('')

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

  /**
   * 获取用户所有分组
   */
  const fetchGroups = async (): Promise<void> => {
    isLoading.value = true
    error.value = ''

    try {
      const authToken = getAuthToken()

      const response = await fetch('/api/xhs/groups', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '获取分组列表失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const responseData = await response.json()
      
      // API 返回格式: { code, message, data: { items: [] } }
      const result = responseData.data || responseData
      groups.value = result.items || []
      
    } catch (err: any) {
      console.error('获取分组列表失败:', err)
      
      let errorMessage = '获取分组列表失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      error.value = errorMessage
      toast.error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 创建分组
   * @param name 分组名称
   */
  const createGroup = async (name: string): Promise<XhsGroup | null> => {
    if (!name.trim()) {
      toast.error('分组名称不能为空')
      return null
    }

    try {
      const authToken = getAuthToken()

      const response = await fetch('/api/xhs/groups', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '创建分组失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const responseData = await response.json()
      
      // API 返回格式: { code, message, data: group }
      const newGroup: XhsGroup = responseData.data || responseData
      
      // 添加到本地状态
      groups.value.push(newGroup)
      
      toast.success('分组创建成功')
      return newGroup
      
    } catch (err: any) {
      console.error('创建分组失败:', err)
      
      let errorMessage = '创建分组失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('已存在')) {
        errorMessage = '分组名称已存在'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
      return null
    }
  }

  /**
   * 更新分组
   * @param id 分组ID
   * @param name 新的分组名称
   */
  const updateGroup = async (id: string, name: string): Promise<XhsGroup | null> => {
    if (!name.trim()) {
      toast.error('分组名称不能为空')
      return null
    }

    try {
      const authToken = getAuthToken()

      const response = await fetch(`/api/xhs/groups/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '更新分组失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      const responseData = await response.json()
      
      // API 返回格式: { code, message, data: group }
      const updatedGroup: XhsGroup = responseData.data || responseData
      
      // 更新本地状态
      const index = groups.value.findIndex(g => g.id === id)
      if (index !== -1) {
        groups.value[index] = updatedGroup
      }
      
      toast.success('分组更新成功')
      return updatedGroup
      
    } catch (err: any) {
      console.error('更新分组失败:', err)
      
      let errorMessage = '更新分组失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('已存在')) {
        errorMessage = '分组名称已存在'
      } else if (errorMsg.includes('不存在')) {
        errorMessage = '分组不存在'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
      return null
    }
  }

  /**
   * 删除分组
   * @param id 分组ID
   */
  const deleteGroup = async (id: string): Promise<boolean> => {
    try {
      const authToken = getAuthToken()

      const response = await fetch(`/api/xhs/groups/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '删除分组失败'
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } catch {
          // 如果不是JSON格式，使用默认错误消息
        }
        
        throw new Error(errorMessage)
      }

      // 从本地状态中移除
      groups.value = groups.value.filter(g => g.id !== id)
      
      toast.success('分组删除成功')
      return true
      
    } catch (err: any) {
      console.error('删除分组失败:', err)
      
      let errorMessage = '删除分组失败，请稍后重试'
      const errorMsg = err?.message || ''
      
      if (errorMsg.includes('登录')) {
        errorMessage = '请先登录'
      } else if (errorMsg.includes('默认分组')) {
        errorMessage = '不能删除默认分组'
      } else if (errorMsg.includes('不存在')) {
        errorMessage = '分组不存在'
      } else if (errorMsg) {
        errorMessage = errorMsg
      }
      
      toast.error(errorMessage)
      return false
    }
  }

  /**
   * 获取默认分组
   */
  const getDefaultGroup = computed(() => {
    return groups.value.find(g => g.isDefault)
  })

  /**
   * 获取非默认分组
   */
  const customGroups = computed(() => {
    return groups.value.filter(g => !g.isDefault)
  })

  /**
   * 刷新分组列表
   */
  const refresh = async (): Promise<void> => {
    await fetchGroups()
  }

  return {
    // 状态
    groups,
    isLoading,
    error,

    // 计算属性
    getDefaultGroup,
    customGroups,

    // 方法
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    refresh
  }
}

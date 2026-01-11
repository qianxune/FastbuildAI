/**
 * XHS笔记生成相关类型定义
 */

/**
 * 生成笔记DTO
 */
export interface GenerateNoteDto {
  /**
   * 用户输入内容
   */
  content: string

  /**
   * 生成模式
   */
  mode: 'ai-generate' | 'ai-compose' | 'add-emoji'

  /**
   * 高级选项 - AI模型
   */
  aiModel?: string

  /**
   * 高级选项 - 创作风格
   */
  style?: '活泼' | '严谨' | '专业' | '可爱'

  /**
   * 高级选项 - 温度参数
   */
  temperature?: string

  /**
   * 高级选项 - 最大长度
   */
  maxLength?: string

  /**
   * 高级选项 - emoji频率
   */
  emojiFrequency?: '少' | '适中' | '多'

  /**
   * 高级选项 - 生成标题数量
   */
  titleCount?: string
}

/**
 * 创建笔记DTO
 */
export interface CreateNoteDto {
  /**
   * 标题
   */
  title: string

  /**
   * 内容
   */
  content: string

  /**
   * 生成模式
   */
  mode: string

  /**
   * 分组ID
   */
  groupId?: string

  /**
   * 封面图片
   */
  coverImages?: string[]

  /**
   * 原始输入
   */
  originalInput?: string
}

/**
 * 更新笔记DTO
 */
export interface UpdateNoteDto {
  /**
   * 标题
   */
  title?: string

  /**
   * 内容
   */
  content?: string

  /**
   * 分组ID
   */
  groupId?: string

  /**
   * 封面图片
   */
  coverImages?: string[]
}

/**
 * 笔记实体
 */
export interface XhsNote {
  /**
   * ID
   */
  id: string

  /**
   * 标题
   */
  title: string

  /**
   * 内容
   */
  content: string

  /**
   * 封面图片
   */
  coverImages: string[]

  /**
   * 字数
   */
  wordCount: number

  /**
   * 生成模式
   */
  mode: string

  /**
   * 原始输入
   */
  originalInput?: string

  /**
   * 用户ID
   */
  userId: string

  /**
   * 分组ID
   */
  groupId?: string

  /**
   * 分组信息
   */
  group?: XhsGroup

  /**
   * 创建时间
   */
  createdAt: string

  /**
   * 更新时间
   */
  updatedAt: string
}

/**
 * 分组实体
 */
export interface XhsGroup {
  /**
   * ID
   */
  id: string

  /**
   * 名称
   */
  name: string

  /**
   * 是否为默认分组
   */
  isDefault: boolean

  /**
   * 用户ID
   */
  userId: string

  /**
   * 笔记列表
   */
  notes?: XhsNote[]

  /**
   * 创建时间
   */
  createdAt: string

  /**
   * 更新时间
   */
  updatedAt: string
}

/**
 * 查询笔记DTO
 */
export interface QueryNoteDto {
  /**
   * 页码
   */
  page?: number

  /**
   * 每页数量
   */
  limit?: number

  /**
   * 分组ID
   */
  groupId?: string

  /**
   * 关键词
   */
  keyword?: string

  /**
   * 排序字段
   */
  sortBy?: string

  /**
   * 排序方向
   */
  sortOrder?: 'ASC' | 'DESC'
}

/**
 * 搜索笔记DTO
 */
export interface SearchNoteDto {
  /**
   * 关键词
   */
  keyword: string

  /**
   * 是否精确匹配
   */
  exact?: boolean
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  /**
   * 数据列表
   */
  items: T[]

  /**
   * 总数
   */
  total: number

  /**
   * 当前页
   */
  page: number

  /**
   * 每页数量
   */
  limit: number

  /**
   * 总页数
   */
  totalPages: number
}

/**
 * 流式事件类型
 */
export interface StreamEvent {
  /**
   * 事件类型
   */
  type: 'start' | 'chunk' | 'complete' | 'error'

  /**
   * 事件消息
   */
  message?: string

  /**
   * 数据内容
   */
  data?: string

  /**
   * 完整内容
   */
  fullContent?: string

  /**
   * 错误代码
   */
  code?: string

  /**
   * 时间戳
   */
  timestamp?: string
}

/**
 * 生成模式配置
 */
export interface GenerationMode {
  /**
   * 模式键
   */
  key: 'ai-generate' | 'ai-compose' | 'add-emoji'

  /**
   * 显示标签
   */
  label: string

  /**
   * 描述
   */
  description: string
}
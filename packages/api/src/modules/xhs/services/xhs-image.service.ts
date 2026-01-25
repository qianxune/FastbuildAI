import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@buildingai/db/@nestjs/typeorm'
import { Repository } from '@buildingai/db/typeorm'
import { XhsImage } from '@buildingai/db/entities'
import { BaseService } from '@buildingai/base'
import { HttpErrorFactory } from '@buildingai/errors'
import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

/**
 * 小红书图片服务
 * 处理图片上传、AI自动配图和历史图片查询
 */
@Injectable()
export class XhsImageService extends BaseService<XhsImage> {
  constructor(
    @InjectRepository(XhsImage)
    private readonly xhsImageRepository: Repository<XhsImage>,
  ) {
    super(xhsImageRepository)
  }

  /**
   * 上传图片
   * @param file 上传的文件
   * @param userId 用户ID
   * @returns 图片记录
   */
  async upload(file: Express.Multer.File, userId: string): Promise<XhsImage> {
    try {
      // 验证文件格式
      const allowedFormats = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
      ]
      if (!allowedFormats.includes(file.mimetype)) {
        throw HttpErrorFactory.badRequest('不支持的图片格式，仅支持 jpg, png, gif, webp')
      }

      // 验证文件大小 (5MB)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        throw HttpErrorFactory.badRequest('图片大小不能超过 5MB')
      }

      // 生成唯一文件名
      const ext = path.extname(file.originalname)
      const filename = `${uuidv4()}${ext}`

      // 确定存储路径 - 使用当前工作目录作为项目根目录（Docker 中是 /buildingai）
      const projectRoot = process.cwd()
      const uploadDir = path.join(projectRoot, 'storage', 'uploads', 'xhs-images')
      console.log('📁 Project root:', projectRoot)
      console.log('📁 Upload directory:', uploadDir)

      await fs.mkdir(uploadDir, { recursive: true })

      const filePath = path.join(uploadDir, filename)
      console.log('💾 Saving file to:', filePath)

      // 保存文件
      await fs.writeFile(filePath, file.buffer)
      console.log('✅ File saved successfully')

      // 验证文件是否真的写入了
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      console.log('🔍 File exists after write:', fileExists)

      // 生成访问URL (使用 /uploads 前缀，与静态文件服务配置一致)
      const url = `/uploads/xhs-images/${filename}`
      console.log('🌐 Generated URL:', url)

      // 创建图片记录
      const image = this.xhsImageRepository.create({
        url,
        type: 'upload',
        userId,
      })

      return await this.xhsImageRepository.save(image)
    } catch (error) {
      console.error('❌ Upload error:', error)
      if (error.status) {
        throw error
      }
      throw HttpErrorFactory.internal('图片上传失败', { error: error.message })
    }
  }

  /**
   * AI自动配图
   * 根据笔记内容生成匹配的图片
   * @param content 笔记内容
   * @param userId 用户ID
   * @returns 图片记录
   */
  async generateAuto(content: string, userId: string): Promise<XhsImage> {
    try {
      // TODO: 集成AI图片生成服务
      // 目前返回占位符图片
      // 实际实现时应该调用 DALL-E, Midjourney, Stable Diffusion 等服务

      // 从内容中提取关键词作为提示词（未来用于AI生成）
      const prompt = this.extractKeywords(content)
      console.log('🔍 Extracted keywords for AI generation:', prompt)

      // 模拟AI生成图片URL
      // 实际应该调用图片生成API
      const url = `/storage/uploads/xhs-images/auto-generated-${uuidv4()}.jpg`

      // 创建图片记录
      const image = this.xhsImageRepository.create({
        url,
        type: 'auto',
        userId,
      })

      return await this.xhsImageRepository.save(image)
    } catch (error) {
      throw HttpErrorFactory.internal('自动配图失败', { error: error.message })
    }
  }

  /**
   * 获取用户的历史图片
   * @param userId 用户ID
   * @param page 页码
   * @param limit 每页数量
   * @returns 图片列表和总数
   */
  async findHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: XhsImage[]; total: number; page: number; limit: number }> {
    try {
      const [items, total] = await this.xhsImageRepository.findAndCount({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      })

      return {
        items,
        total,
        page,
        limit,
      }
    } catch (error) {
      throw HttpErrorFactory.internal('获取历史图片失败', { error: error.message })
    }
  }

  /**
   * 从内容中提取关键词
   * @param content 内容文本
   * @returns 关键词字符串
   */
  private extractKeywords(content: string): string {
    // 简单的关键词提取逻辑
    // 实际应该使用更复杂的NLP算法
    const words = content
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1)
      .slice(0, 10)

    return words.join(' ')
  }
}

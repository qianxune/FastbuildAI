import { Injectable } from '@nestjs/common';

/**
 * 内容审核服务
 * 负责检测敏感词和不当内容
 */
@Injectable()
export class ContentModerationService {
    /**
     * 敏感词列表
     * 在实际项目中，这些词汇应该从配置文件或数据库中加载
     */
    private readonly sensitiveWords = [
        // 政治敏感词
        '政治', '政府', '官员', '腐败', '抗议', '示威',
        // 暴力相关
        '暴力', '杀害', '伤害', '攻击', '武器', '炸弹',
        // 色情相关
        '色情', '裸体', '性行为', '成人内容',
        // 赌博相关
        '赌博', '博彩', '彩票', '赌场', '下注',
        // 毒品相关
        '毒品', '吸毒', '贩毒', '大麻', '海洛因',
        // 诈骗相关
        '诈骗', '欺诈', '传销', '非法集资', '洗钱',
        // 仇恨言论
        '仇恨', '歧视', '种族主义', '恶意攻击',
        // 其他违法内容
        '违法', '犯罪', '非法', '黑客', '盗版'
    ];

    /**
     * 检测文本中是否包含敏感词
     * @param text 待检测的文本
     * @returns 检测结果
     */
    checkSensitiveWords(text: string): {
        hasSensitiveWords: boolean;
        sensitiveWords: string[];
        message?: string;
    } {
        if (!text || typeof text !== 'string') {
            return {
                hasSensitiveWords: false,
                sensitiveWords: []
            };
        }

        const foundSensitiveWords: string[] = [];
        const lowerText = text.toLowerCase();

        // 检测敏感词
        for (const word of this.sensitiveWords) {
            if (lowerText.includes(word.toLowerCase())) {
                foundSensitiveWords.push(word);
            }
        }

        const hasSensitiveWords = foundSensitiveWords.length > 0;

        return {
            hasSensitiveWords,
            sensitiveWords: foundSensitiveWords,
            message: hasSensitiveWords 
                ? `内容包含敏感词汇：${foundSensitiveWords.join('、')}，请修改后重试`
                : undefined
        };
    }

    /**
     * 检测笔记内容是否合规
     * @param title 笔记标题
     * @param content 笔记内容
     * @returns 检测结果
     */
    moderateNoteContent(title: string, content: string): {
        isValid: boolean;
        message?: string;
        violations: string[];
    } {
        const violations: string[] = [];

        // 检测标题
        if (title) {
            const titleCheck = this.checkSensitiveWords(title);
            if (titleCheck.hasSensitiveWords) {
                violations.push(`标题包含敏感词：${titleCheck.sensitiveWords.join('、')}`);
            }
        }

        // 检测内容
        if (content) {
            const contentCheck = this.checkSensitiveWords(content);
            if (contentCheck.hasSensitiveWords) {
                violations.push(`内容包含敏感词：${contentCheck.sensitiveWords.join('、')}`);
            }
        }

        // 检测内容长度是否异常（可能是垃圾内容）
        if (content && content.length > 10000) {
            violations.push('内容过长，可能包含垃圾信息');
        }

        // 检测是否包含大量重复字符（可能是垃圾内容）
        if (content && this.hasExcessiveRepetition(content)) {
            violations.push('内容包含大量重复字符，可能是垃圾信息');
        }

        const isValid = violations.length === 0;

        return {
            isValid,
            message: isValid ? undefined : violations.join('；'),
            violations
        };
    }

    /**
     * 检测生成内容是否合规（用于AI生成前的检查）
     * @param input 用户输入内容
     * @returns 检测结果
     */
    moderateGenerationInput(input: string): {
        isValid: boolean;
        message?: string;
        violations: string[];
    } {
        const violations: string[] = [];

        if (!input || typeof input !== 'string') {
            violations.push('输入内容无效');
            return {
                isValid: false,
                message: '输入内容无效',
                violations
            };
        }

        // 检测敏感词
        const sensitiveCheck = this.checkSensitiveWords(input);
        if (sensitiveCheck.hasSensitiveWords) {
            violations.push(`输入内容包含敏感词：${sensitiveCheck.sensitiveWords.join('、')}`);
        }

        // 检测是否为恶意输入
        if (this.isMaliciousInput(input)) {
            violations.push('输入内容可能包含恶意信息');
        }

        const isValid = violations.length === 0;

        return {
            isValid,
            message: isValid ? undefined : violations.join('；'),
            violations
        };
    }

    /**
     * 检测是否包含过多重复字符
     * @param text 待检测文本
     * @returns 是否包含过多重复
     */
    private hasExcessiveRepetition(text: string): boolean {
        // 检测连续重复字符（超过10个相同字符）
        const repetitionPattern = /(.)\1{9,}/;
        if (repetitionPattern.test(text)) {
            return true;
        }

        // 检测重复短语（同一个词或短语重复超过5次）
        const words = text.split(/\s+/);
        const wordCount = new Map<string, number>();
        
        for (const word of words) {
            if (word.length > 1) {
                const count = wordCount.get(word) || 0;
                wordCount.set(word, count + 1);
                if (count + 1 > 5) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 检测是否为恶意输入
     * @param input 用户输入
     * @returns 是否为恶意输入
     */
    private isMaliciousInput(input: string): boolean {
        // 检测SQL注入尝试
        const sqlInjectionPatterns = [
            /union\s+select/i,
            /drop\s+table/i,
            /delete\s+from/i,
            /insert\s+into/i,
            /update\s+set/i,
            /exec\s*\(/i,
            /script\s*>/i
        ];

        for (const pattern of sqlInjectionPatterns) {
            if (pattern.test(input)) {
                return true;
            }
        }

        // 检测XSS尝试
        const xssPatterns = [
            /<script[^>]*>/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe[^>]*>/i,
            /<object[^>]*>/i
        ];

        for (const pattern of xssPatterns) {
            if (pattern.test(input)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 添加敏感词到黑名单
     * @param words 要添加的敏感词列表
     */
    addSensitiveWords(words: string[]): void {
        this.sensitiveWords.push(...words);
    }

    /**
     * 获取当前敏感词列表（用于管理）
     * @returns 敏感词列表
     */
    getSensitiveWords(): string[] {
        return [...this.sensitiveWords];
    }
}
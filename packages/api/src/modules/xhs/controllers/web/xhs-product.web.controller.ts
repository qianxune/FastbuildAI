import { BaseController } from "@buildingai/base";
import { type UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { HttpErrorFactory } from "@buildingai/errors";
import { WebController } from "@common/decorators/controller.decorator";
import {
    Body,
    Delete,
    Get,
    Param,
    Post,
    Query,
    UploadedFile,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import {
    BatchDeleteProductsDto,
    BatchSetProductCategoryDto,
    ClearProductCategoryDto,
    RenameProductCategoryDto,
} from "../../dto";
import { QueryProductDto } from "../../dto/query-product.dto";
import type { ImportProductResult } from "../../services/xhs-product.service";
import { XhsProductService } from "../../services/xhs-product.service";

/**
 * 小红书商�?SKU Web 控制器（妙手导入�?
 * 路由顺序：静态路由在动态路由前（products/import, products/by-ids, products, products/:id�?
 */
@WebController("xhs")
export class XhsProductWebController extends BaseController {
    constructor(private readonly xhsProductService: XhsProductService) {
        super();
    }

    /**
     * 导入 Excel（妙手导�?SKU�?
     * POST /api/xhs/products/import
     */
    @Post("products/import")
    @UseInterceptors(FileInterceptor("file"))
    async importExcel(
        @UploadedFile() file: Express.Multer.File,
        @Playground() user: UserPlayground,
    ): Promise<ImportProductResult> {
        if (!file) {
            throw HttpErrorFactory.badRequest("请选择要上传的 Excel 文件");
        }
        const ext = (file.originalname || "").toLowerCase();
        if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
            throw HttpErrorFactory.badRequest("仅支�?.xlsx �?.xls 格式");
        }
        let buffer: Buffer;
        if (file.buffer) {
            buffer = file.buffer;
        } else if (file.path) {
            const fs = await import("node:fs/promises");
            buffer = await fs.readFile(file.path);
        } else {
            throw HttpErrorFactory.badRequest("无法读取文件内容");
        }
        const fileWithBuffer = { ...file, buffer } as Express.Multer.File;
        return this.xhsProductService.importFromExcel(fileWithBuffer, user.id);
    }

    /**
     * 批量�?ID 获取商品（用于生成笔记前拉取选中商品�?
     * GET /api/xhs/products/by-ids?ids=id1,id2
     */
    @Get("products/by-ids")
    async getByIds(@Query("ids") idsStr: string, @Playground() user: UserPlayground) {
        const ids = (idsStr || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) {
            return { items: [] };
        }
        const items = await this.xhsProductService.findByIds(ids, user.id);
        return { items };
    }

    /**
     * 分类及 SKU 数量（分类管理页，须写在 products/categories 之前）
     * GET /api/xhs/products/categories/stats
     */
    @Get("products/categories/stats")
    async categoryStats(@Playground() user: UserPlayground) {
        const items = await this.xhsProductService.listCategoryStats(user.id);
        return { items };
    }

    /**
     * 当前用户已使用的商品分类（用于筛选）
     * GET /api/xhs/products/categories
     */
    @Get("products/categories")
    async listCategories(@Playground() user: UserPlayground) {
        const items = await this.xhsProductService.listDistinctCategories(user.id);
        return { items };
    }

    /**
     * 重命名分类（将该分类下全部 SKU 改到新名称）
     * POST /api/xhs/products/rename-category
     */
    @Post("products/rename-category")
    async renameCategory(
        @Body() dto: RenameProductCategoryDto,
        @Playground() user: UserPlayground,
    ) {
        const updated = await this.xhsProductService.renameCategoryForUser(
            user.id,
            dto.fromCategory,
            dto.toCategory,
        );
        return {
            updated,
            message: updated ? `已更新 ${updated} 个商品的分类` : "没有需要更新的商品",
        };
    }

    /**
     * 清空某分类（该名称下全部 SKU 的 category 置空）
     * POST /api/xhs/products/clear-category
     */
    @Post("products/clear-category")
    async clearCategoryByName(
        @Body() dto: ClearProductCategoryDto,
        @Playground() user: UserPlayground,
    ) {
        const updated = await this.xhsProductService.clearCategoryByNameForUser(
            user.id,
            dto.category,
        );
        return {
            updated,
            message: updated ? `已清空 ${updated} 个商品的分类` : "没有匹配的商品",
        };
    }

    /**
     * 批量设置商品分类
     * POST /api/xhs/products/batch-set-category
     */
    @Post("products/batch-set-category")
    async batchSetCategory(
        @Body() dto: BatchSetProductCategoryDto,
        @Playground() user: UserPlayground,
    ) {
        const updated = await this.xhsProductService.batchSetCategoryForUser(
            dto.ids,
            dto.category,
            user.id,
        );
        return { updated, message: updated ? `已更新 ${updated} 个商品的分类` : "未更新任何商品" };
    }

    /**
     * 商品列表（分�?+ 关键词搜索）
     * GET /api/xhs/products?page=1&limit=20&keyword=xxx
     */
    @Get("products")
    async list(@Query() query: QueryProductDto, @Playground() user: UserPlayground) {
        return this.xhsProductService.findByUser(user.id, query);
    }

    /**
     * 商品列表（按SPU分组）
     * GET /api/xhs/products/grouped?page=1&limit=20&keyword=xxx
     */
    @Get("products/grouped")
    async listGrouped(@Query() query: QueryProductDto, @Playground() user: UserPlayground) {
        return this.xhsProductService.findByUserGrouped(user.id, query);
    }

    /**
     * 批量删除商品
     * POST /api/xhs/products/batch-delete
     */
    @Post("products/batch-delete")
    async batchDelete(
        @Body() dto: BatchDeleteProductsDto,
        @Playground() user: UserPlayground,
    ) {
        const ids = Array.isArray(dto.ids) ? dto.ids.filter(Boolean) : [];
        if (!ids.length) {
            return { deleted: 0, message: "未选择商品" };
        }
        const deleted = await this.xhsProductService.deleteManyForUser(ids, user.id);
        return { deleted, message: `成功删除 ${deleted} 个商品` };
    }

    /**
     * 商品详情
     * GET /api/xhs/products/:id
     */
    @Get("products/:id")
    async getById(@Param("id") id: string, @Playground() user: UserPlayground) {
        return this.xhsProductService.findOneForUser(id, user.id);
    }

    /**
     * 删除单个商品
     * DELETE /api/xhs/products/:id
     */
    @Delete("products/:id")
    async deleteById(@Param("id") id: string, @Playground() user: UserPlayground) {
        await this.xhsProductService.deleteOne(id, user.id);
        return { message: "商品已删除" };
    }
}

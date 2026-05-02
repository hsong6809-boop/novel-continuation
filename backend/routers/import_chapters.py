"""章节导入路由"""
import re
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
from models.database import get_db_ctx
from utils.text_utils import count_chinese_words
from utils.chinese_num import chinese_to_arabic

router = APIRouter(prefix="/api/projects", tags=["import"])


class ChapterItem(BaseModel):
    chapter_number: int = Field(..., ge=1)
    title: Optional[str] = None
    content: str = Field(..., min_length=1)


class BatchImportRequest(BaseModel):
    chapters: List[ChapterItem]
    start_from: Optional[int] = None  # 从第几章开始编号，None=自动


def split_text_to_chapters(text: str) -> List[dict]:
    """智能拆分文本为章节，支持多种格式"""
    # 常见章节标题模式
    patterns = [
        r'第[一二三四五六七八九十百千\d]+章\s*[：:\s]*(.+)?',  # 第X章 标题
        r'第[一二三四五六七八九十百千\d]+节\s*[：:\s]*(.+)?',  # 第X节
        r'Chapter\s+(\d+)\s*[：:\s]*(.+)?',                    # Chapter X
        r'CHAPTER\s+(\d+)\s*[：:\s]*(.+)?',                    # CHAPTER X
        r'^\d+[\.、]\s*(.+)?',                                   # 1. 标题 或 1、标题
        r'^【第[一二三四五六七八九十百千\d]+章】\s*(.+)?',       # 【第X章】
    ]

    combined = '|'.join(f'({p})' for p in patterns)

    # 找到所有章节分割点
    splits = []
    for m in re.finditer(combined, text, re.MULTILINE):
        splits.append((m.start(), m.group().strip()))

    if not splits:
        # 没找到章节标题，把整个文本当作一章
        return [{"chapter_number": 1, "title": None, "content": text.strip()}]

    chapters = []
    for i, (pos, header) in enumerate(splits):
        # 提取章节号：优先匹配阿拉伯数字，再匹配中文数字
        ch_num = None
        # 尝试从 "第X章/节" 中提取中文/阿拉伯数字
        cn_match = re.search(r'第([一二三四五六七八九十百千零\d]+)[章节]', header)
        if cn_match:
            ch_num = chinese_to_arabic(cn_match.group(1))
        if ch_num is None:
            # 尝试 "Chapter X" 或 "X. 标题" 格式
            num_match = re.search(r'(\d+)', header)
            ch_num = int(num_match.group(1)) if num_match else None
        if ch_num is None:
            # 最终回退：用上一章 + 1
            ch_num = (chapters[-1]["chapter_number"] + 1) if chapters else i + 1

        # 提取标题（去掉章节号后的部分）
        title = re.sub(r'^第[一二三四五六七八九十百千\d]+章\s*[：:\s]*', '', header)
        title = re.sub(r'^第[一二三四五六七八九十百千\d]+节\s*[：:\s]*', '', title)
        title = re.sub(r'^Chapter\s+\d+\s*[：:\s]*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'^CHAPTER\s+\d+\s*[：:\s]*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'^\d+[\.、]\s*', '', title)
        title = re.sub(r'^【第[一二三四五六七八九十百千\d]+章】\s*', '', title)
        title = title.strip() or None

        # 内容 = 当前标题到下一个标题之间
        content_start = pos + len(header)
        content_end = splits[i + 1][0] if i + 1 < len(splits) else len(text)
        content = text[content_start:content_end].strip()

        if content:  # 跳过空章节
            chapters.append({
                "chapter_number": ch_num,
                "title": title,
                "content": content,
            })

    return chapters


@router.post("/{project_id}/import/batch")
async def batch_import_chapters(project_id: int, data: BatchImportRequest):
    """批量导入章节（粘贴模式）"""
    async with get_db_ctx() as db:
        # 检查项目存在
        cursor = await db.execute("SELECT id, current_chapter FROM projects WHERE id=?", (project_id,))
        project = await cursor.fetchone()
        if not project:
            raise HTTPException(404, "项目不存在")

        imported = 0
        skipped = 0
        max_chapter = project["current_chapter"] or 0

        for ch in data.chapters:
            ch_num = ch.chapter_number
            # 检查是否已存在
            cursor = await db.execute(
                "SELECT id FROM chapters WHERE project_id=? AND chapter_number=?",
                (project_id, ch_num),
            )
            existing = await cursor.fetchone()
            if existing:
                skipped += 1
                continue

            word_count = count_chinese_words(ch.content)
            await db.execute(
                """INSERT INTO chapters (project_id, chapter_number, title, content, word_count, status)
                   VALUES (?, ?, ?, ?, ?, 'imported')""",
                (project_id, ch_num, ch.title, ch.content, word_count),
            )
            imported += 1
            if ch_num > max_chapter:
                max_chapter = ch_num

        # 更新项目统计
        cursor = await db.execute(
            "SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE project_id=?",
            (project_id,),
        )
        total_words = (await cursor.fetchone())[0]

        await db.execute(
            "UPDATE projects SET current_chapter=?, current_words=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (max_chapter, total_words, project_id),
        )
        await db.commit()

        return {
            "imported": imported,
            "skipped": skipped,
            "total_words": total_words,
            "max_chapter": max_chapter,
        }


@router.post("/{project_id}/import/file")
async def import_from_file(project_id: int, file: UploadFile = File(...)):
    """从文件导入章节（上传模式）"""
    content = await file.read()

    # 尝试多种编码
    text = None
    # 优先使用 charset_normalizer 自动检测编码
    try:
        from charset_normalizer import from_bytes
        result = from_bytes(content).best()
        if result:
            text = str(result)
    except ImportError:
        pass

    # charset_normalizer 未安装或检测失败，回退到手动尝试
    if text is None:
        for enc in ["utf-8", "gbk", "gb2312", "big5", "utf-16"]:
            try:
                text = content.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue
    if text is None:
        raise HTTPException(400, "无法识别文件编码，请使用 UTF-8 编码")

    # 智能拆分
    chapters = split_text_to_chapters(text)
    if not chapters:
        raise HTTPException(400, "未能从文件中识别出章节内容")

    # 转为 BatchImportRequest 格式复用逻辑
    batch = BatchImportRequest(chapters=[
        ChapterItem(chapter_number=c["chapter_number"], title=c["title"], content=c["content"])
        for c in chapters
    ])
    return await batch_import_chapters(project_id, batch)


@router.post("/{project_id}/preprocess")
async def preprocess_project(project_id: int):
    """导入后预处理：批量提取角色、伏笔、时间线、分卷大纲"""
    from services.preprocess_service import preprocess_imported_chapters
    result = await preprocess_imported_chapters(project_id)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.post("/{project_id}/import/large-process")
async def large_process_import(project_id: int):
    """大文件导入后分块处理：按5万字分块，逐块生成章纲+提取元数据"""
    from services.large_import_service import large_import_and_process
    result = await large_import_and_process(project_id)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result

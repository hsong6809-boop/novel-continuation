"""FTS5 全文检索服务 - 搜索早期章节的相关片段"""
from models.database import get_db


async def search_related_fragments(
    project_id: int,
    current_chapter: int,
    keywords: list[str],
    exclude_range: tuple[int, int] = None,
    max_results: int = 5,
    snippet_length: int = 500,
) -> list[dict]:
    """
    用 FTS5 搜索与当前章节相关的早期章节片段。
    
    Args:
        project_id: 项目ID
        current_chapter: 当前章节号
        keywords: 搜索关键词列表（角色名、地名、事件等）
        exclude_range: 排除的章节范围 (start, end)，默认排除最近15章
        max_results: 最大返回片段数
        snippet_length: 每个片段的目标长度
    
    Returns:
        [{"chapter_number": int, "title": str, "snippet": str, "rank": float}]
    """
    if not keywords:
        return []
    
    if exclude_range is None:
        exclude_range = (max(1, current_chapter - 15), current_chapter)
    
    db = await get_db()
    try:
        # 构建 FTS5 查询：用 OR 连接关键词
        # 对中文分词做简单处理，用空格分隔
        fts_query = " OR ".join(keywords)
        
        # 搜索并排除近期章节
        sql = """
            SELECT 
                c.chapter_number,
                c.title,
                snippet(chapters_fts, 0, '【', '】', '...', ?) as snippet,
                rank
            FROM chapters_fts fts
            JOIN chapters c ON c.id = fts.rowid
            WHERE chapters_fts MATCH ?
              AND c.project_id = ?
              AND c.content != ''
              AND c.chapter_number < ?
              AND c.chapter_number NOT BETWEEN ? AND ?
            ORDER BY rank
            LIMIT ?
        """
        
        cursor = await db.execute(sql, (
            snippet_length,
            fts_query,
            project_id,
            current_chapter,
            exclude_range[0],
            exclude_range[1],
            max_results,
        ))
        
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    
    except Exception:
        # FTS 查询失败时静默返回空列表（关键词可能包含特殊字符）
        return []
    finally:
        await db.close()


async def extract_keywords_from_context(
    project_id: int, chapter: int
) -> list[str]:
    """
    从章纲、角色名、伏笔描述中提取搜索关键词。
    """
    db = await get_db()
    keywords = set()
    
    try:
        # 1. 角色名
        cursor = await db.execute(
            "SELECT name FROM characters WHERE project_id=?",
            (project_id,),
        )
        for row in await cursor.fetchall():
            name = row["name"]
            if len(name) >= 2:  # 跳过单字名
                keywords.add(name)
        
        # 2. 当前章纲中的关键词（标题 + 核心目标）
        cursor = await db.execute(
            """SELECT title, core_objective, hooks 
               FROM chapter_outlines 
               WHERE project_id=? AND chapter_number=?""",
            (project_id, chapter),
        )
        outline = await cursor.fetchone()
        if outline:
            for field in ["title", "core_objective", "hooks"]:
                val = outline[field]
                if val:
                    # 简单分词：按标点和空格拆分，取 2-4 字的词
                    import re
                    tokens = re.split(r'[，。、；！？\s,.\-;!?]+', val)
                    for t in tokens:
                        t = t.strip()
                        if 2 <= len(t) <= 6:
                            keywords.add(t)
        
        # 3. 活跃伏笔的描述
        cursor = await db.execute(
            "SELECT description FROM foreshadowing WHERE project_id=? AND status='active'",
            (project_id,),
        )
        for row in await cursor.fetchall():
            desc = row["description"]
            if desc:
                import re
                tokens = re.split(r'[，。、；！？\s,.\-;!?]+', desc)
                for t in tokens:
                    t = t.strip()
                    if 2 <= len(t) <= 6:
                        keywords.add(t)
    
    finally:
        await db.close()
    
    return list(keywords)[:20]  # 限制关键词数量


async def get_early_chapter_fragments(
    project_id: int, current_chapter: int
) -> list[dict]:
    """
    一站式接口：提取关键词 → FTS 搜索 → 返回相关早期章节片段。
    """
    keywords = await extract_keywords_from_context(project_id, current_chapter)
    if not keywords:
        return []
    
    fragments = await search_related_fragments(
        project_id, current_chapter, keywords,
        max_results=5,
        snippet_length=500,
    )
    
    return fragments

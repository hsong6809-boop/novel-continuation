"""数据库连接与初始化"""
import aiosqlite
from contextlib import asynccontextmanager
from config import DATABASE_DIR

DB_PATH = DATABASE_DIR / "novel.db"


async def get_db() -> aiosqlite.Connection:
    """获取数据库连接"""
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


@asynccontextmanager
async def get_db_ctx():
    """数据库连接上下文管理器，自动关闭连接"""
    db = await get_db()
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    """初始化数据库表"""
    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
    finally:
        await db.close()
        # 迁移：为已有数据库添加新表和字段
    await _migrate()


async def _migrate():
    """增量迁移：给已有数据库补新表/新字段"""
    db = await get_db()
    try:
        # 检查 volume_outlines 表是否存在
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='volume_outlines'"
        )
        if not await cursor.fetchone():
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS volume_outlines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    volume_number INTEGER NOT NULL,
                    volume_name TEXT,
                    summary TEXT,
                    core_events TEXT,
                    emotional_tone TEXT,
                    key_turning_point TEXT,
                    chapter_start INTEGER,
                    chapter_end INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    UNIQUE(project_id, volume_number)
                );
            """)

        # 检查 chapter_outlines 是否有 volume_id 字段
        cursor = await db.execute("PRAGMA table_info(chapter_outlines)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "volume_id" not in columns:
            await db.execute(
                "ALTER TABLE chapter_outlines ADD COLUMN volume_id INTEGER REFERENCES volume_outlines(id) ON DELETE SET NULL"
            )

        # 检查 projects 是否有 platform/notes 字段
        cursor = await db.execute("PRAGMA table_info(projects)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "platform" not in columns:
            await db.execute("ALTER TABLE projects ADD COLUMN platform TEXT")
        if "notes" not in columns:
            await db.execute("ALTER TABLE projects ADD COLUMN notes TEXT")

        # 检查 chapter_versions 表是否存在
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_versions'"
        )
        if not await cursor.fetchone():
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS chapter_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    chapter_number INTEGER NOT NULL,
                    version INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    word_count INTEGER DEFAULT 0,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
            """)

        await db.commit()
    finally:
        await db.close()


SCHEMA_SQL = """
-- 项目表
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    genre TEXT,
    description TEXT,
    model_provider TEXT DEFAULT 'deepseek',
    model_name TEXT DEFAULT 'deepseek-chat',
    target_words INTEGER DEFAULT 200000,
    current_words INTEGER DEFAULT 0,
    current_chapter INTEGER DEFAULT 0,
    style_notes TEXT,
    volume_summaries TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 章节表
CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    word_count INTEGER DEFAULT 0,
    summary TEXT,
    status TEXT DEFAULT 'draft',
    volume_label TEXT,
    arc_label TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, chapter_number)
);

-- 分卷大纲表
CREATE TABLE IF NOT EXISTS volume_outlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    volume_number INTEGER NOT NULL,
    volume_name TEXT,
    summary TEXT,
    core_events TEXT,
    emotional_tone TEXT,
    key_turning_point TEXT,
    chapter_start INTEGER,
    chapter_end INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, volume_number)
);

-- 章纲表
CREATE TABLE IF NOT EXISTS chapter_outlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    volume_id INTEGER,
    title TEXT,
    core_objective TEXT,
    emotional_arc TEXT,
    hooks TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (volume_id) REFERENCES volume_outlines(id) ON DELETE SET NULL,
    UNIQUE(project_id, chapter_number)
);

-- 场景要点表
CREATE TABLE IF NOT EXISTS scene_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    scene_order INTEGER NOT NULL,
    mission TEXT,
    key_dialogue_hint TEXT,
    atmosphere TEXT,
    target_words_ratio REAL DEFAULT 0.25,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, chapter_number, scene_order)
);

-- 角色表
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    age TEXT,
    personality TEXT,
    speech_style TEXT,
    appearance TEXT,
    background TEXT,
    relationships TEXT,
    character_arc_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, name)
);

-- 角色状态快照表
CREATE TABLE IF NOT EXISTS character_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    character_name TEXT NOT NULL,
    current_state TEXT NOT NULL,
    extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, chapter_number, character_name)
);

-- 风格档案表
CREATE TABLE IF NOT EXISTS style_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    base_analysis TEXT,
    human_notes TEXT,
    default_description_density INTEGER DEFAULT 3,
    default_dialogue_ratio INTEGER DEFAULT 3,
    default_pacing TEXT DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 伏笔与悬念表
CREATE TABLE IF NOT EXISTS foreshadowing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    planted_chapter INTEGER NOT NULL,
    expected_reveal_chapter INTEGER,
    actual_reveal_chapter INTEGER,
    status TEXT DEFAULT 'active',
    importance TEXT DEFAULT 'normal',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 故事时间线表
CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    story_time_description TEXT NOT NULL,
    story_date TEXT,
    duration TEXT,
    summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 对话历史表
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 章节版本历史表
CREATE TABLE IF NOT EXISTS chapter_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- FTS5 全文索引（用于正文检索）
CREATE VIRTUAL TABLE IF NOT EXISTS chapters_fts USING fts5(
    content,
    content='chapters',
    content_rowid='id'
);

-- FTS 触发器
CREATE TRIGGER IF NOT EXISTS chapters_ai AFTER INSERT ON chapters BEGIN
    INSERT INTO chapters_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chapters_ad AFTER DELETE ON chapters BEGIN
    INSERT INTO chapters_fts(chapters_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS chapters_au AFTER UPDATE ON chapters BEGIN
    INSERT INTO chapters_fts(chapters_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO chapters_fts(rowid, content) VALUES (new.id, new.content);
END;
"""

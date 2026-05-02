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
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
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
        if "style_ref_chapters" not in columns:
            await db.execute("ALTER TABLE projects ADD COLUMN style_ref_chapters TEXT DEFAULT '1,2,3'")

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

        # === 新增字段迁移 ===

        # chapter_outlines 新增 rhythm_type, chapter_opening
        cursor = await db.execute("PRAGMA table_info(chapter_outlines)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "rhythm_type" not in columns:
            await db.execute("ALTER TABLE chapter_outlines ADD COLUMN rhythm_type TEXT")
        if "chapter_opening" not in columns:
            await db.execute("ALTER TABLE chapter_outlines ADD COLUMN chapter_opening TEXT")
        if "source" not in columns:
            await db.execute("ALTER TABLE chapter_outlines ADD COLUMN source TEXT DEFAULT 'extracted'")

        # scene_points 新增 scene_type
        cursor = await db.execute("PRAGMA table_info(scene_points)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "scene_type" not in columns:
            await db.execute("ALTER TABLE scene_points ADD COLUMN scene_type TEXT")

        # volume_outlines 新增 internal_rhythm, volume_hook
        cursor = await db.execute("PRAGMA table_info(volume_outlines)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "internal_rhythm" not in columns:
            await db.execute("ALTER TABLE volume_outlines ADD COLUMN internal_rhythm TEXT")
        if "volume_hook" not in columns:
            await db.execute("ALTER TABLE volume_outlines ADD COLUMN volume_hook TEXT")

        # chapters 新增 self_review_status, emotion_peak
        cursor = await db.execute("PRAGMA table_info(chapters)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "self_review_status" not in columns:
            await db.execute("ALTER TABLE chapters ADD COLUMN self_review_status TEXT")
        if "emotion_peak" not in columns:
            await db.execute("ALTER TABLE chapters ADD COLUMN emotion_peak TEXT")

        # characters 新增 spans_all_volumes
        cursor = await db.execute("PRAGMA table_info(characters)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "spans_all_volumes" not in columns:
            await db.execute("ALTER TABLE characters ADD COLUMN spans_all_volumes INTEGER DEFAULT 0")
            # 男主/女主自动标记为贯穿全文
            await db.execute(
                "UPDATE characters SET spans_all_volumes=1 WHERE role LIKE '%主%' OR role LIKE '%贯穿%'"
            )

        # === 性能索引迁移（为已有数据库补索引）===
        index_statements = [
            "CREATE INDEX IF NOT EXISTS idx_chapters_project_number ON chapters(project_id, chapter_number)",
            "CREATE INDEX IF NOT EXISTS idx_chapters_project_content ON chapters(project_id, content) WHERE content != ''",
            "CREATE INDEX IF NOT EXISTS idx_chapter_outlines_project_number ON chapter_outlines(project_id, chapter_number)",
            "CREATE INDEX IF NOT EXISTS idx_scene_points_project_chapter ON scene_points(project_id, chapter_number)",
            "CREATE INDEX IF NOT EXISTS idx_character_snapshots_project_ch ON character_snapshots(project_id, chapter_number, character_name)",
            "CREATE INDEX IF NOT EXISTS idx_foreshadowing_project_status ON foreshadowing(project_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_timeline_project_chapter ON timeline(project_id, chapter_number)",
            "CREATE INDEX IF NOT EXISTS idx_chat_history_project ON chat_history(project_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_chapter_versions_project_ch ON chapter_versions(project_id, chapter_number, version)",
            "CREATE INDEX IF NOT EXISTS idx_settings_library_project_cat ON settings_library(project_id, category, importance)",
            "CREATE INDEX IF NOT EXISTS idx_volume_outlines_project_ch ON volume_outlines(project_id, chapter_start, chapter_end)",
            "CREATE INDEX IF NOT EXISTS idx_style_baselines_project_vol ON style_baselines(project_id, volume_number, is_baseline)",
        ]
        for stmt in index_statements:
            await db.execute(stmt)

        # === timeline 补 UNIQUE 约束（去重 + 支持 ON CONFLICT）===
        cursor = await db.execute("PRAGMA index_list(timeline)")
        indexes = [row[1] for row in await cursor.fetchall()]
        has_unique = False
        for idx_name in indexes:
            cursor2 = await db.execute(f"PRAGMA index_info('{idx_name}')")
            cols = [row[2] for row in await cursor2.fetchall()]
            if set(cols) == {"project_id", "chapter_number"}:
                cursor3 = await db.execute(
                    "SELECT sql FROM sqlite_master WHERE name=?", (idx_name,)
                )
                sql_row = await cursor3.fetchone()
                if sql_row and "UNIQUE" in (sql_row[0] or "").upper():
                    has_unique = True
                    break
        if not has_unique:
            await db.execute("""
                DELETE FROM timeline WHERE id NOT IN (
                    SELECT MIN(id) FROM timeline GROUP BY project_id, chapter_number
                )
            """)
            await db.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_unique ON timeline(project_id, chapter_number)"
            )

        # === FTS5 重建（为已有数据补索引）===
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='chapters_fts'"
        )
        if await cursor.fetchone():
            await db.execute("INSERT INTO chapters_fts(chapters_fts) VALUES('rebuild')")

        # 设定库表
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='settings_library'"
        )
        if not await cursor.fetchone():
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS settings_library (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    details TEXT,
                    source_chapter INTEGER,
                    importance TEXT DEFAULT 'normal',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    UNIQUE(project_id, category, name)
                );
            """)

        # 风格基线表
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='style_baselines'"
        )
        if not await cursor.fetchone():
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS style_baselines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    volume_number INTEGER,
                    analysis TEXT NOT NULL,
                    deviation_from_baseline TEXT,
                    is_baseline INTEGER DEFAULT 0,
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
    platform TEXT,
    notes TEXT,
    style_ref_chapters TEXT DEFAULT '1,2,3',
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
    self_review_status TEXT,
    emotion_peak TEXT,
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
    internal_rhythm TEXT,
    volume_hook TEXT,
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
    rhythm_type TEXT,
    chapter_opening TEXT,
    version INTEGER DEFAULT 1,
    source TEXT DEFAULT 'extracted',
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
    scene_type TEXT,
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
    spans_all_volumes INTEGER DEFAULT 0,
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
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, chapter_number)
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

-- 设定库表
CREATE TABLE IF NOT EXISTS settings_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    details TEXT,
    source_chapter INTEGER,
    importance TEXT DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, category, name)
);

-- 风格基线表
CREATE TABLE IF NOT EXISTS style_baselines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    volume_number INTEGER,
    analysis TEXT NOT NULL,
    deviation_from_baseline TEXT,
    is_baseline INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 性能索引
CREATE INDEX IF NOT EXISTS idx_chapters_project_number ON chapters(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_chapters_project_content ON chapters(project_id, content) WHERE content != '';
CREATE INDEX IF NOT EXISTS idx_chapter_outlines_project_number ON chapter_outlines(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_scene_points_project_chapter ON scene_points(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_character_snapshots_project_ch ON character_snapshots(project_id, chapter_number, character_name);
CREATE INDEX IF NOT EXISTS idx_foreshadowing_project_status ON foreshadowing(project_id, status);
CREATE INDEX IF NOT EXISTS idx_timeline_project_chapter ON timeline(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_chat_history_project ON chat_history(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chapter_versions_project_ch ON chapter_versions(project_id, chapter_number, version);
CREATE INDEX IF NOT EXISTS idx_settings_library_project_cat ON settings_library(project_id, category, importance);
CREATE INDEX IF NOT EXISTS idx_volume_outlines_project_ch ON volume_outlines(project_id, chapter_start, chapter_end);
CREATE INDEX IF NOT EXISTS idx_style_baselines_project_vol ON style_baselines(project_id, volume_number, is_baseline);

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

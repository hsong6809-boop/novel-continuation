"""文本工具函数"""
import re


def count_chinese_words(text: str) -> int:
    """统计字数：去除空白字符后的总字符数

    网文平台标准算法：中文字符 + 标点 + 英文单词/字母 + 数字，去掉空格/换行/制表符。
    与前端 countWords 逻辑一致。
    """
    if not text:
        return 0
    # 去除所有空白字符（空格、换行、制表符等），保留其余所有字符
    return len(re.sub(r'\s', '', text))

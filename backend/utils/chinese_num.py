"""中文数字工具函数"""


def chinese_to_arabic(text: str) -> int | None:
    """将中文数字转为阿拉伯数字

    支持：一~九千九百九十九，以及阿拉伯数字混用
    示例：十一→11, 三十五→35, 一百二十→120, 二百零三→203
    """
    if not text:
        return None

    # 如果本身就是阿拉伯数字
    if text.isdigit():
        v = int(text)
        return v if v > 0 else None

    digit_map = {
        '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    }
    unit_map = {
        '十': 10, '百': 100, '千': 1000,
    }

    result = 0
    current = 0  # 当前累积的数字（十位/百位/千位之前的系数）

    for ch in text:
        if ch in digit_map:
            current = digit_map[ch]
        elif ch in unit_map:
            unit = unit_map[ch]
            if current == 0 and unit == 10:
                # "十X" 开头，如 "十五" = 15
                current = 1
            result += current * unit
            current = 0
        elif ch.isdigit():
            current = int(ch)
        else:
            return None

    result += current

    return result if result > 0 else None

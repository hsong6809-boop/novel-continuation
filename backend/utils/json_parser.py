"""通用 JSON 提取工具 - 从 LLM 输出中提取 JSON"""
import json
import re


def _fix_truncated_json(text: str) -> str:
    """尝试修复被截断的 JSON：补全未闭合的字符串、数组、对象"""
    # 统计未闭合的括号
    stack = []
    in_string = False
    escape_next = False
    last_valid = len(text) - 1

    for i, ch in enumerate(text):
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in '{[':
            stack.append(ch)
        elif ch == '}':
            if stack and stack[-1] == '{':
                stack.pop()
        elif ch == ']':
            if stack and stack[-1] == '[':
                stack.pop()

    # 如果正在字符串中，先闭合字符串
    if in_string:
        text += '"'

    # 闭合所有未闭合的括号
    for bracket in reversed(stack):
        if bracket == '{':
            text += '}'
        elif bracket == '[':
            text += ']'

    return text


def _fix_unescaped_quotes(text: str) -> str:
    """修复 JSON 字符串值中未转义的双引号。

    策略：逐字符扫描，跟踪是否在字符串内。
    在字符串内遇到 " 时，判断它是否是结构性引号（后跟 : , } ] 或空白）。
    如果不是结构性引号，则转义为 \"。
    """
    result = []
    in_string = False
    escape_next = False
    i = 0
    while i < len(text):
        ch = text[i]
        if escape_next:
            result.append(ch)
            escape_next = False
            i += 1
            continue
        if ch == '\\' and in_string:
            result.append(ch)
            escape_next = True
            i += 1
            continue
        if ch == '"':
            if not in_string:
                in_string = True
                result.append(ch)
            else:
                # 判断是否是结构性引号：后面紧跟 , } ] : 或空白/换行
                rest = text[i + 1:].lstrip()
                if not rest or rest[0] in ':,}]':
                    # 结构性引号，结束字符串
                    in_string = False
                    result.append(ch)
                else:
                    # 内容中的引号，转义
                    result.append('\\"')
            i += 1
            continue
        result.append(ch)
        i += 1
    return ''.join(result)


def extract_json(text: str) -> dict:
    """从 LLM 输出中提取 JSON，处理 markdown 代码块和前导文本。

    优先级：
    1. 尝试提取 markdown code block 中的内容
    2. 尝试找到第一个 { 到最后一个 } 之间的内容
    3. 尝试修复截断的 JSON
    4. 尝试修复字符串值中未转义的引号
    5. 直接尝试 json.loads
    """
    text = text.strip()
    if not text:
        raise json.JSONDecodeError("Empty text", text, 0)

    # 策略 1: 提取 markdown code block
    code_block = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if code_block:
        try:
            return json.loads(code_block.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 策略 2: 找到 JSON 对象边界
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        json_str = text[start:end + 1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # 策略 3: 尝试修复截断的 JSON
        try:
            fixed = _fix_truncated_json(json_str)
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 策略 4: 修复字符串值中未转义的引号
        try:
            fixed = _fix_unescaped_quotes(json_str)
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 策略 5: 修复截断 + 未转义引号
        try:
            fixed = _fix_unescaped_quotes(json_str)
            fixed = _fix_truncated_json(fixed)
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

    # 策略 6: 直接解析
    return json.loads(text)

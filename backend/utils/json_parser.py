"""通用 JSON 提取工具 - 从 LLM 输出中提取 JSON"""
import json
import re


def extract_json(text: str) -> dict:
    """从 LLM 输出中提取 JSON，处理 markdown 代码块和前导文本。

    优先级：
    1. 尝试提取 markdown code block 中的内容
    2. 尝试找到第一个 { 到最后一个 } 之间的内容
    3. 直接尝试 json.loads
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
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    # 策略 3: 直接解析
    return json.loads(text)

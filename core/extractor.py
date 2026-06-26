from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
import os 

def get_llm():
    return ChatMistralAI(model = "mistral-small-latest", mistral_api_key = os.getenv("MISTRAL_API_KEY"),temperature=0.2)



def build_chain(system_prompt : str):
    llm = get_llm()
    return (
        RunnablePassthrough() | RunnableLambda(lambda x : {"text" : x}) |ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human","{text}"),
    ]) | llm |StrOutputParser()
    )

def extract_action_items(transcript:str)->str:
    chain = build_chain(
        "You are an expert meeting analyst. From the meeting transcript, "
        "extract all action items. For each action item, provide:\n"
        "1. Task description (Do NOT use bold styling, double asterisks `**`, or any stars formatting anywhere in the output)\n"
        "- Person 1 (or Person 2, Person 3, etc. sequentially for each action item: write 'Person X: <Name of responsible person>' where X is the task index starting at 1. Do NOT use the word 'Owner' anywhere in the output)\n"
        "- Deadline (if mentioned, else write 'Not specified')\n\n"
        "Format as a numbered list without any bold markdown formatting (do NOT use asterisks/stars `**`). "
        "For example, the first item should be formatted exactly as:\n"
        "1. Task description here\n"
        "- Person 1: Name\n"
        "- Deadline: Not specified\n\n"
        "If no action items are found, output 'No action items found.'"
    )

    raw_result = chain.invoke(transcript)
    
    # Clean up any double asterisks (stars) formatting
    cleaned = raw_result.replace("**", "").replace("*", "")
    
    # Replace any "owner" or "assigned" labels sequentially with Person 1, Person 2, etc.
    import re
    owner_pattern = re.compile(r'(?i)\b(owner|assigned)\b(\s*\(who is responsible\))?:?')
    
    counter = [1]
    def replacer(match):
        res = f"Person {counter[0]}"
        if ":" in match.group(0):
            res += ":"
        counter[0] += 1
        return res
        
    cleaned = owner_pattern.sub(replacer, cleaned)
    return cleaned

def extract_key_decisions(transcript: str) -> str:
    chain = build_chain(
        "You are an expert meeting analyst. From the meeting transcript, "
        "extract all key decisions made. Format as a numbered list without "
        "using bold styling or asterisks. If none found say 'No key decisions found.'"
    )
    return chain.invoke(transcript).replace("**", "").replace("*", "")


def extract_questions(transcript: str) -> str:
    chain = build_chain(
        "From the meeting transcript, extract all unresolved questions "
        "or topics needing follow-up. Format as a numbered list without "
        "using bold styling or asterisks. If none found say 'No open questions found.'"
    )
    return chain.invoke(transcript).replace("**", "").replace("*", "")

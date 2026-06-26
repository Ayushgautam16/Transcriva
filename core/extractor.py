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
        "- Person 1 (or Person 2, Person 3, etc. sequentially for each action item): write `Person X: <full name of responsible person>` exactly as spoken in the transcript. "
        "Do not substitute a role title like 'team lead', 'engineer', or 'owner' when the speaker's name is available.\n"
        "- Deadline (if mentioned, else write 'Not specified')\n\n"
        "Format as a numbered list without any bold markdown formatting (do NOT use asterisks/stars `**`). "
        "For example, the first item should be formatted exactly as:\n"
        "1. Task description here\n"
        "- Person 1: Rahul\n"
        "- Deadline: Not specified\n\n"
        "If no action items are found, output 'No action items found.'"
    )

    raw_result = chain.invoke(transcript)
    return raw_result.replace("**", "").replace("*", "")

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

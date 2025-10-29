from openai import OpenAI
client = OpenAI(api_key="YOUR_API_KEY")

def generate_hint(student_query: str):
    similar_problems = semantic_search(student_query)
    context = "\n\n".join([p["problem"] + "\nSolution:\n" + p["solution"] for p in similar_problems])

    prompt = f"""
    You are an Olympiad math tutor.
    The student asked: "{student_query}"

    Here are related problems and solutions:
    {context}

    Provide a helpful hint to guide them to the solution without giving the final answer.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content

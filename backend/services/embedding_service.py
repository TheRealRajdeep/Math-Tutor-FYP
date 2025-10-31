from sentence_transformers import SentenceTransformer
from functools import lru_cache


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    import os
    model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    return SentenceTransformer(model_name)


def generate_embedding(text: str):
    model = get_embedding_model()
    return model.encode(text or "").tolist()



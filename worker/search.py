import json
import os
from pathlib import Path
import sys
import unicodedata

os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

import chromadb
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


BOOK_TITLES = {
    "bbobbo-119-iyusik": "삐뽀삐뽀 119 이유식",
    "teuni-iyusik": "튼이 이유식",
}


def embed_query(model_dir, text):
    tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=512)
    tokens = tokenizer.encode("query: " + text)
    ids = np.asarray([tokens.ids], dtype=np.int64)
    mask = np.asarray([tokens.attention_mask], dtype=np.int64)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    model = ort.InferenceSession(str(model_dir / "model_quantized.onnx"), sess_options=options,
                                 providers=["CPUExecutionProvider"])
    hidden = model.run(None, {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)})[0]
    pooled = (hidden * mask[:, :, None]).sum(axis=1) / mask.sum(axis=1, keepdims=True)
    return (pooled / np.linalg.norm(pooled, axis=1, keepdims=True)).tolist()


def name_key(value):
    return "".join(unicodedata.normalize("NFKC", value).casefold().split())


def search(root, request):
    index = root / "index"
    if not (index / "chroma.sqlite3").is_file():
        raise FileNotFoundError("검수된 Chroma 인덱스가 필요합니다.")
    client = chromadb.PersistentClient(path=str(index))
    recipes = client.get_collection("verified_recipes", embedding_function=None)
    policy = {"$and": [
        {"stage": request["stage"]},
        {"review_status": "verified"},
    ]}
    count = len(recipes.get(where=policy, include=[])["ids"])
    if not count:
        return []
    inventory = [item["name"] for item in request["inventory"] if item["available"]]
    environment = request.get("cookingEnvironment")
    # Put the stage and inventory first so they survive the model's token limit.
    query = (f"월령 {request['ageMonths']}개월 {request['stage']} 이유식. 보유 재료 "
             + ", ".join(inventory)
             + (f"\n조리 환경 {environment}" if environment else "")
             + "\n가족 선호 " + request["familyInstructions"])
    hits = recipes.query(query_embeddings=embed_query(root / "model", query),
                         where=policy, n_results=count, include=["documents", "metadatas", "distances"])
    available_names = {name_key(name) for name in inventory}

    def rank(hit):
        metadata, _, distance = hit
        ingredient_names = {name_key(name) for name in metadata.get("ingredients", "").split(",")}
        return -len(available_names & ingredient_names), distance

    candidates = zip(hits["metadatas"][0], hits["documents"][0], hits["distances"][0])
    references = []
    for metadata, document, _ in sorted(candidates, key=rank)[:max(8, request["menuCount"] * 2)]:
        source_key = metadata["source_key"]
        book = metadata.get("book_title") or BOOK_TITLES[source_key]
        references.append({
            "title": metadata["title"],
            "servingScope": metadata.get("serving_scope", "recipe"),
            "sources": [{"sourceKey": source_key, "book": book, "page": int(page)}
                        for page in metadata["pdf_pages"].split(",")],
            "recipe": document,
        })
    return references


if __name__ == "__main__":
    print(json.dumps(search(Path(sys.argv[1]), json.load(sys.stdin)), ensure_ascii=False))

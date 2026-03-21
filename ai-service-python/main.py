from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CMN Coffee AI Recommendations")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "ai-service-python"}


@app.get("/recommendations")
def recommendations(customer_id: int = Query(..., alias="customer_id")):
    """
    Mock: trả Top 3 món hot (có thể thay bằng phân tích lịch sử theo customer_id).
    """
    _ = customer_id
    return {"product_ids": [7, 9, 11]}

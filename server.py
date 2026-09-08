"""
CommitDay - Servidor Backend FastAPI
Atende a aplicação web estática e fornece endpoints de persistência em SQLite / Arquivo.
"""

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import storage

app = FastAPI(
    title="CommitDay API",
    description="Backend de persistência e monitoramento de commits do GitLab",
    version="1.2.0",
)

# Habilita CORS para desenvolvimento flexível
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializa o repositório configurado
store = storage.get_storage()


class SyncDataPayload(BaseModel):
    developers: Optional[List[Dict[str, Any]]] = None
    projects: Optional[List[Dict[str, Any]]] = None
    config: Optional[Dict[str, Any]] = None
    mode: Optional[str] = None
    selectedProjectId: Optional[str] = None


@app.get("/api/health")
def get_health():
    return {
        "status": "ok",
        "app": "CommitDay",
        "storage_type": store.get_storage_type(),
        "storage_path": store.get_storage_path(),
    }


@app.get("/api/data")
def get_all_data():
    return store.get_all_data()


@app.post("/api/data")
def save_all_data(payload: Dict[str, Any]):
    try:
        current_data = store.get_all_data()
        current_data.update(payload)
        store.save_all_data(current_data)
        return {"status": "success", "message": "Dados salvos com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar dados: {str(e)}")


@app.get("/api/projects")
def get_projects():
    data = store.get_all_data()
    return data.get("projects", [])


@app.post("/api/projects")
def update_projects(projects: List[Dict[str, Any]]):
    current_data = store.get_all_data()
    current_data["projects"] = projects
    store.save_all_data(current_data)
    return {"status": "success", "projects": projects}


@app.get("/api/developers")
def get_developers():
    data = store.get_all_data()
    return data.get("developers", [])


@app.post("/api/developers")
def update_developers(developers: List[Dict[str, Any]]):
    current_data = store.get_all_data()
    current_data["developers"] = developers
    store.save_all_data(current_data)
    return {"status": "success", "developers": developers}


# Rotas para servir os arquivos da aplicação frontend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@app.get("/")
def serve_index():
    index_file = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="index.html não encontrado")


@app.get("/style.css")
def serve_css():
    css_file = os.path.join(BASE_DIR, "style.css")
    if os.path.exists(css_file):
        return FileResponse(css_file, media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css não encontrado")


@app.get("/app.js")
def serve_js():
    js_file = os.path.join(BASE_DIR, "app.js")
    if os.path.exists(js_file):
        return FileResponse(js_file, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js não encontrado")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 3000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("server:app", host=host, port=port, reload=False)

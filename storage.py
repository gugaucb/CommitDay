"""
CommitDay - Módulo de Armazenamento (Storage)
Suporta persistência em SQLite (padrão) e Arquivo JSON.
"""

import json
import os
import sqlite3
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

DEFAULT_DEMO_DEVS = [
    {
        "id": "dev-1",
        "name": "Ana Silva",
        "email": "ana.silva@empresa.com",
        "username": "anasilva",
        "team": "Squad Checkout",
        "projectIds": ["proj-1", "proj-2"],
    },
    {
        "id": "dev-2",
        "name": "Bruno Costa",
        "email": "bruno.costa@empresa.com",
        "username": "brunocosta",
        "team": "Squad Backend",
        "projectIds": ["proj-1", "proj-3"],
    },
    {
        "id": "dev-3",
        "name": "Carla Mendes",
        "email": "carla.mendes@empresa.com",
        "username": "carlamendes",
        "team": "Squad Frontend",
        "projectIds": ["proj-1"],
    },
    {
        "id": "dev-4",
        "name": "Diego Oliveira",
        "email": "diego.oliveira@empresa.com",
        "username": "diegooliveira",
        "team": "Squad Mobile",
        "projectIds": ["proj-2"],
    },
    {
        "id": "dev-5",
        "name": "Elena Rostova",
        "email": "elena.rostova@empresa.com",
        "username": "elenarostova",
        "team": "Squad DevOps",
        "projectIds": ["proj-3"],
    },
    {
        "id": "dev-6",
        "name": "Felipe Santos",
        "email": "felipe.santos@empresa.com",
        "username": "felipesantos",
        "team": "Squad Core",
        "projectIds": ["proj-3"],
    },
]

DEFAULT_DEMO_PROJECTS = [
    {
        "id": "proj-1",
        "name": "Plataforma E-commerce",
        "description": "Sistema principal de vendas e checkout",
        "gitlabProjectId": "101",
        "gitlabUrl": "",
        "gitlabToken": "",
        "devIds": ["dev-1", "dev-2", "dev-3"],
    },
    {
        "id": "proj-2",
        "name": "App Mobile Core",
        "description": "Aplicativo iOS/Android dos clientes",
        "gitlabProjectId": "102",
        "gitlabUrl": "",
        "gitlabToken": "",
        "devIds": ["dev-1", "dev-4"],
    },
    {
        "id": "proj-3",
        "name": "Infraestrutura & Cloud",
        "description": "Automação CI/CD e Kubernetes",
        "gitlabProjectId": "103",
        "gitlabUrl": "",
        "gitlabToken": "",
        "devIds": ["dev-2", "dev-5", "dev-6"],
    },
]

DEFAULT_CONFIG = {
    "url": "https://gitlab.com",
    "token": "",
    "projectId": "",
}


class BaseStorage(ABC):
    @abstractmethod
    def get_all_data(self) -> Dict[str, Any]:
        pass

    @abstractmethod
    def save_all_data(self, data: Dict[str, Any]) -> None:
        pass

    @abstractmethod
    def get_storage_type(self) -> str:
        pass

    @abstractmethod
    def get_storage_path(self) -> str:
        pass


class SQLiteStorage(BaseStorage):
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)
        self.db_path = os.path.join(self.data_dir, "commitday.db")
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS kv_store (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """
            )
            # Inicializa valores padrão caso não existam
            cur = conn.execute("SELECT COUNT(*) as count FROM kv_store")
            row = cur.fetchone()
            if row["count"] == 0:
                conn.execute(
                    "INSERT INTO kv_store (key, value) VALUES (?, ?)",
                    ("developers", json.dumps(DEFAULT_DEMO_DEVS)),
                )
                conn.execute(
                    "INSERT INTO kv_store (key, value) VALUES (?, ?)",
                    ("projects", json.dumps(DEFAULT_DEMO_PROJECTS)),
                )
                conn.execute(
                    "INSERT INTO kv_store (key, value) VALUES (?, ?)",
                    ("config", json.dumps(DEFAULT_CONFIG)),
                )
                conn.execute(
                    "INSERT INTO kv_store (key, value) VALUES (?, ?)",
                    ("mode", json.dumps("demo")),
                )
                conn.execute(
                    "INSERT INTO kv_store (key, value) VALUES (?, ?)",
                    ("selectedProjectId", json.dumps("all")),
                )
                conn.commit()

    def get_all_data(self) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT key, value FROM kv_store")
            rows = cur.fetchall()
            result: Dict[str, Any] = {
                "developers": DEFAULT_DEMO_DEVS,
                "projects": DEFAULT_DEMO_PROJECTS,
                "config": DEFAULT_CONFIG,
                "mode": "demo",
                "selectedProjectId": "all",
            }
            for row in rows:
                try:
                    result[row["key"]] = json.loads(row["value"])
                except Exception:
                    result[row["key"]] = row["value"]
            return result

    def save_all_data(self, data: Dict[str, Any]) -> None:
        with self._get_connection() as conn:
            for key, val in data.items():
                conn.execute(
                    """
                    INSERT INTO kv_store (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                    (key, json.dumps(val)),
                )
            conn.commit()

    def get_storage_type(self) -> str:
        return "sqlite"

    def get_storage_path(self) -> str:
        return self.db_path


class FileStorage(BaseStorage):
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)
        self.file_path = os.path.join(self.data_dir, "storage.json")
        self._init_file()

    def _init_file(self) -> None:
        if not os.path.exists(self.file_path):
            default_data = {
                "developers": DEFAULT_DEMO_DEVS,
                "projects": DEFAULT_DEMO_PROJECTS,
                "config": DEFAULT_CONFIG,
                "mode": "demo",
                "selectedProjectId": "all",
            }
            self.save_all_data(default_data)

    def get_all_data(self) -> Dict[str, Any]:
        if not os.path.exists(self.file_path):
            self._init_file()
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {
                "developers": DEFAULT_DEMO_DEVS,
                "projects": DEFAULT_DEMO_PROJECTS,
                "config": DEFAULT_CONFIG,
                "mode": "demo",
                "selectedProjectId": "all",
            }

    def save_all_data(self, data: Dict[str, Any]) -> None:
        temp_path = self.file_path + ".tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        # Substituição atômica
        if os.path.exists(self.file_path):
            os.replace(temp_path, self.file_path)
        else:
            os.rename(temp_path, self.file_path)

    def get_storage_type(self) -> str:
        return "file"

    def get_storage_path(self) -> str:
        return self.file_path


def get_storage() -> BaseStorage:
    data_dir = os.environ.get("DATA_DIR", os.path.join(os.getcwd(), "data"))
    storage_type = os.environ.get("STORAGE_TYPE", "sqlite").lower()

    if storage_type == "file":
        return FileStorage(data_dir=data_dir)
    return SQLiteStorage(data_dir=data_dir)

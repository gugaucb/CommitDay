FROM python:3.11-slim

# Otimizações de execução Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia arquivos da aplicação
COPY server.py storage.py index.html style.css app.js ./

# Diretório para volume persistente dos dados (SQLite/Arquivo)
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data
ENV STORAGE_TYPE=sqlite
ENV PORT=3000
ENV HOST=0.0.0.0

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["python", "server.py"]

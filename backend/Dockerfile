FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY slotiva ./slotiva
RUN useradd --create-home slotiva
USER slotiva
EXPOSE 8000
CMD ["sh", "-c", "python -m slotiva.db && uvicorn slotiva.main:app --host 0.0.0.0 --port 8000 --no-access-log"]

FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml ./
COPY colcoor_backend ./colcoor_backend
RUN pip install --no-cache-dir .

ENV COLCOOR_ENV=production
EXPOSE 8000
CMD ["uvicorn", "colcoor_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

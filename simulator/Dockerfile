FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY seed_dummy_castings.py .
ENV PYTHONUNBUFFERED=1
CMD ["python", "seed_dummy_castings.py", "--interval", "30"]

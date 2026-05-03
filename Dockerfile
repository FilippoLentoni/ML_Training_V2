FROM public.ecr.aws/docker/library/python:3.11-slim

ENV PYTHONUNBUFFERED=TRUE
ENV PYTHONDONTWRITEBYTECODE=TRUE
ENV PATH="/opt/ml/code:${PATH}"
ENV SAGEMAKER_PROGRAM=train.py

WORKDIR /opt/ml/code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/ /opt/ml/code/

ENTRYPOINT ["python", "train.py"]

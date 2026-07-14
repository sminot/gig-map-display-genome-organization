FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# gig_map_io: install from the vendored source. The upstream git remote
# (github.com/sminot/gig-map-io) is not yet published with the package tree;
# once it is, this can become:  RUN pip install --no-cache-dir "gig_map_io @ git+https://github.com/sminot/gig-map-io.git"
COPY vendor/gig-map-io ./vendor/gig-map-io
RUN pip install --no-cache-dir ./vendor/gig-map-io

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir .

ENV DATASETS_DIR=/data/datasets
ENV SESSION_DIR=/data/session
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# VLF compute

Python container for heavy jobs:

- `POST /parse-poll` — download a poll PDF and extract tables with `pdfplumber`
- `POST /forecast` — Monte Carlo skeleton (not the final Bayesian model)
- `POST /backfill` — placeholder for historical ETL

## Build

```bash
docker build -t vlf-compute apps/compute
docker run --rm -p 8080:8080 vlf-compute
```

## Test

```bash
curl http://127.0.0.1:8080/health

curl -X POST http://127.0.0.1:8080/forecast \
  -H 'content-type: application/json' \
  -d '{"candidates":[{"id":"marine-le-pen","poll_avg":32.5},{"id":"jean-luc-melenchon","poll_avg":17.0}],"draws":20000}'
```

The final model will use PyMC/NumPyro and write posterior summaries to D1/R2. The container is invoked by the pipeline Worker, not exposed publicly.

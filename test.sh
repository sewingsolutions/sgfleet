curl -v -k -N -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY:-sk-REPLACE-ME}" \
  -d '{
    "model": "sgfleet-api-model",
    "messages": [{"role": "user", "content": "Count from 1 to 5 slowly."}],
    "max_tokens": 500,
    "stream": true
  }'

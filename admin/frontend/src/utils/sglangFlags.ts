export interface SglangFlag {
  name: string
  description: string
  type: 'bool' | 'int' | 'float' | 'string' | 'enum'
  defaultValue?: string
  options?: string[]
  category: string
}

export const CONTEXT_LENGTH_PRESETS = [
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '48K', value: 49152 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '256K', value: 262144 },
]

export const MAX_OUTPUT_LENGTH_PRESETS = [
  { label: '256', value: 256 },
  { label: '512', value: 512 },
  { label: '1K', value: 1024 },
  { label: '2K', value: 2048 },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: 'Unlimited', value: -1 },
]

export const SGLANG_FLAGS: SglangFlag[] = [
  // Memory and scheduling
  { name: '--mem-fraction-static', description: 'Fraction of GPU memory for model+KV cache (reduce if OOM)', type: 'float', defaultValue: '0.88', category: 'Memory' },
  { name: '--max-running-requests', description: 'Maximum concurrent running requests', type: 'int', category: 'Memory' },
  { name: '--max-queued-requests', description: 'Maximum queued requests', type: 'int', category: 'Memory' },
  { name: '--max-total-tokens', description: 'Max tokens in memory pool (dev/debug)', type: 'int', category: 'Memory' },
  { name: '--chunked-prefill-size', description: 'Max tokens per chunk for chunked prefill (-1 to disable)', type: 'int', category: 'Memory' },
  { name: '--max-prefill-tokens', description: 'Max tokens in a prefill batch (default 16384)', type: 'int', defaultValue: '16384', category: 'Memory' },
  { name: '--page-size', description: 'Number of tokens in a page', type: 'int', defaultValue: '1', category: 'Memory' },
  { name: '--disable-radix-cache', description: 'Disable radix cache for KV reuse', type: 'bool', category: 'Memory' },
  { name: '--enable-cuda-graph', description: 'Enable CUDA graph capture', type: 'bool', category: 'Memory' },
  { name: '--disable-cuda-graph', description: 'Disable CUDA graph capture', type: 'bool', category: 'Memory' },
  { name: '--radix-eviction-policy', description: 'Radix tree eviction policy', type: 'enum', defaultValue: 'lru', options: ['lru', 'lfu', 'slru', 'priority'], category: 'Memory' },

  // Model and tokenizer
  { name: '--context-length', description: 'Override model context length', type: 'int', category: 'Model' },
  { name: '--dtype', description: 'Data type for weights/activations', type: 'enum', defaultValue: 'auto', options: ['auto', 'half', 'float16', 'bfloat16', 'float', 'float32'], category: 'Model' },
  { name: '--quantization', description: 'Quantization method', type: 'enum', options: ['awq', 'fp8', 'gptq', 'marlin', 'gptq_marlin', 'awq_marlin', 'bitsandbytes', 'gguf', 'modelopt', 'auto-round', 'compressed-tensors', 'unquant'], category: 'Model' },
  { name: '--kv-cache-dtype', description: 'KV cache data type', type: 'enum', defaultValue: 'auto', options: ['auto', 'fp8_e5m2', 'fp8_e4m3', 'bf16', 'bfloat16', 'nvfp4', 'fp4_mx_block16'], category: 'Model' },
  { name: '--load-format', description: 'Model weights load format', type: 'enum', defaultValue: 'auto', options: ['auto', 'pt', 'safetensors', 'npcache', 'dummy', 'gguf', 'bitsandbytes', 'layered', 'flash_rl', 'fastsafetensors'], category: 'Model' },
  { name: '--trust-remote-code', description: 'Allow custom Hub models', type: 'bool', category: 'Model' },
  { name: '--tokenizer-mode', description: 'Tokenizer mode', type: 'enum', defaultValue: 'auto', options: ['auto', 'slow'], category: 'Model' },
  { name: '--tokenizer-backend', description: 'Tokenizer backend library', type: 'enum', defaultValue: 'huggingface', options: ['huggingface', 'fastokens'], category: 'Model' },
  { name: '--is-embedding', description: 'Use CausalLM as embedding model', type: 'bool', category: 'Model' },
  { name: '--model-impl', description: 'Which model implementation to use', type: 'enum', defaultValue: 'auto', options: ['auto', 'sglang', 'transformers'], category: 'Model' },

  // Parallelism
  { name: '--tensor-parallel-size', description: 'Tensor parallel size (TP)', type: 'int', defaultValue: '1', category: 'Parallelism' },
  { name: '--pipeline-parallel-size', description: 'Pipeline parallel size (PP)', type: 'int', defaultValue: '1', category: 'Parallelism' },
  { name: '--num-expert-parallel-size', description: 'Expert parallel size for MoE', type: 'int', defaultValue: '1', category: 'Parallelism' },

  // Attention
  { name: '--attention-backend', description: 'Attention backend', type: 'enum', options: ['flashinfer', 'flash_atten', 'triton', 'xformers', 'torch_native'], category: 'Attention' },
  { name: '--scheduler-policy', description: 'Request scheduling policy', type: 'enum', defaultValue: 'fcfs', options: ['lpm', 'random', 'fcfs', 'dfs-weight', 'lof', 'priority', 'routing-key'], category: 'Attention' },
  { name: '--schedule-conservativeness', description: 'Scheduler conservativeness (larger = more conservative)', type: 'float', defaultValue: '1.0', category: 'Attention' },

  // Serving
  { name: '--stream-interval', description: 'Streaming output interval in bytes', type: 'int', category: 'Serving' },
  { name: '--skip-server-warmup', description: 'Skip server warmup phase', type: 'bool', category: 'Serving' },
  { name: '--enable-metrics', description: 'Enable Prometheus metrics endpoint', type: 'bool', category: 'Serving' },
  { name: '--enable-tracing', description: 'Enable request tracing', type: 'bool', category: 'Serving' },
  { name: '--log-requests', description: 'Log request contents', type: 'bool', category: 'Serving' },
  { name: '--log-level-request', description: 'Log level for requests', type: 'enum', defaultValue: 'warning', options: ['debug', 'info', 'warning', 'error', 'critical'], category: 'Serving' },
  { name: '--api-key', description: 'API key for authentication', type: 'string', category: 'Serving' },
  { name: '--decoupled-uuv', description: 'Decoupled UV mode', type: 'bool', category: 'Serving' },
  { name: '--random-seed', description: 'Random seed for reproducibility', type: 'int', category: 'Serving' },

  // Generation
  { name: '--max-total-token-usage', description: 'Max total token usage limit', type: 'int', category: 'Generation' },
  { name: '--max-running-token-usage', description: 'Max running token usage limit', type: 'int', category: 'Generation' },
  { name: '--completion-ignore-eos', description: 'Ignore EOS token during generation', type: 'bool', category: 'Generation' },

  // Optimization
  { name: '--enable-deterministic-inference', description: 'Enable deterministic inference', type: 'bool', category: 'Optimization' },
  { name: '--enable-torch-compile', description: 'Enable torch.compile acceleration', type: 'bool', category: 'Optimization' },
  { name: '--enable-p2p-check', description: 'Enable P2P check for multi-GPU', type: 'bool', category: 'Optimization' },
  { name: '--enable-dynamic-chunking', description: 'Enable dynamic chunk size adjustment', type: 'bool', category: 'Optimization' },
  { name: '--enable-fp32-lm-head', description: 'Use FP32 for LM head outputs', type: 'bool', category: 'Optimization' },
  { name: '--enable-tf32-matmul', description: 'Enable TF32 matmul for performance', type: 'bool', category: 'Optimization' },
  { name: '--disable-log-stats', description: 'Disable logging of batch stats', type: 'bool', category: 'Optimization' },

  // Speculative decoding
  { name: '--speculative-algorithm', description: 'Speculative decoding algorithm', type: 'enum', options: ['recapture', 'lmhead'], category: 'Speculative' },
  { name: '--speculative-draft', description: 'Draft model for speculative decoding', type: 'string', category: 'Speculative' },
  { name: '--speculative-num-steps', description: 'Number of speculative steps', type: 'int', category: 'Speculative' },
  { name: '--speculative-eagle-topk', description: 'EAGLE top-k for speculative decoding', type: 'int', category: 'Speculative' },
  { name: '--speculative-num-draft-token', description: 'Number of draft tokens', type: 'int', category: 'Speculative' },

  // Tool use
  { name: '--enable-tools', description: 'Enable tool use API', type: 'bool', category: 'Features' },
  { name: '--tool-call-parser', description: 'Tool call parsing mode', type: 'enum', options: ['auto', 'native', 'json'], category: 'Features' },
]

export const SGLANG_FLAG_CATEGORIES = [...new Set(SGLANG_FLAGS.map((f) => f.category))]

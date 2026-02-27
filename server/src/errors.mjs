export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class UpstreamHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function toErrorResponse(err, requestId) {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          requestId
        }
      }
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error',
        requestId
      }
    }
  };
}

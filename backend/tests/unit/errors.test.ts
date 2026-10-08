import { describe, expect, it } from "vitest";
import { AppError, Errors } from "../../src/shared/errors.js";

describe("AppError", () => {
  it("creates error with code, message, and status code", () => {
    const error = new AppError("TEST_ERROR", "Test message", 400);
    expect(error.code).toBe("TEST_ERROR");
    expect(error.message).toBe("Test message");
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe("AppError");
  });

  it("creates error with details", () => {
    const details = { field: "email", reason: "invalid" };
    const error = new AppError("VALIDATION_ERROR", "Invalid email", 400, details);
    expect(error.details).toEqual(details);
  });

  it("defaults to 400 status code", () => {
    const error = new AppError("TEST_ERROR", "Test message");
    expect(error.statusCode).toBe(400);
  });

  it("defaults to undefined details", () => {
    const error = new AppError("TEST_ERROR", "Test message", 400);
    expect(error.details).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const error = new AppError("TEST_ERROR", "Test message");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("Errors.validation", () => {
  it("creates 400 validation error", () => {
    const error = Errors.validation();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("The request failed validation.");
  });

  it("includes validation details", () => {
    const details = { fields: ["email", "phone"] };
    const error = Errors.validation(details);
    expect(error.details).toEqual(details);
  });
});

describe("Errors.unauthorized", () => {
  it("creates 401 unauthorized error", () => {
    const error = Errors.unauthorized();
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Authentication is required.");
  });

  it("accepts custom message", () => {
    const error = Errors.unauthorized("Invalid token");
    expect(error.message).toBe("Invalid token");
  });
});

describe("Errors.forbidden", () => {
  it("creates 403 forbidden error", () => {
    const error = Errors.forbidden();
    expect(error.code).toBe("FORBIDDEN");
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("You are not allowed to perform this action.");
  });

  it("accepts custom message", () => {
    const error = Errors.forbidden("Admin only");
    expect(error.message).toBe("Admin only");
  });
});

describe("Errors.notFound", () => {
  it("creates 404 not found error", () => {
    const error = Errors.notFound("BOOKING_NOT_FOUND", "Booking not found");
    expect(error.code).toBe("BOOKING_NOT_FOUND");
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Booking not found");
  });
});

describe("Errors.conflict", () => {
  it("creates 409 conflict error", () => {
    const error = Errors.conflict("DUPLICATE_BOOKING", "Booking already exists");
    expect(error.code).toBe("DUPLICATE_BOOKING");
    expect(error.statusCode).toBe(409);
  });

  it("includes conflict details", () => {
    const details = { existingId: "123" };
    const error = Errors.conflict("DUPLICATE", "Duplicate", details);
    expect(error.details).toEqual(details);
  });
});

describe("Errors.unprocessable", () => {
  it("creates 422 unprocessable error", () => {
    const error = Errors.unprocessable("INVALID_STATE", "Cannot process");
    expect(error.code).toBe("INVALID_STATE");
    expect(error.statusCode).toBe(422);
  });

  it("includes details", () => {
    const details = { currentState: "completed" };
    const error = Errors.unprocessable("INVALID_STATE", "Cannot process", details);
    expect(error.details).toEqual(details);
  });
});

describe("Errors.rateLimited", () => {
  it("creates 429 rate limit error", () => {
    const error = Errors.rateLimited();
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.statusCode).toBe(429);
    expect(error.message).toContain("Too many requests");
  });
});

describe("Errors.unavailable", () => {
  it("creates 503 service unavailable error", () => {
    const error = Errors.unavailable("SERVICE_DOWN", "Service temporarily unavailable");
    expect(error.code).toBe("SERVICE_DOWN");
    expect(error.statusCode).toBe(503);
  });
});

describe("Errors.internal", () => {
  it("creates 500 internal error", () => {
    const error = Errors.internal();
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe("An unexpected error occurred.");
  });

  it("accepts custom message", () => {
    const error = Errors.internal("Database connection failed");
    expect(error.message).toBe("Database connection failed");
  });
});

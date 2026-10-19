Feature: Payment idempotency and retrieval
  As an API consumer
  I want payment submissions with idempotency keys to guarantee at-most-once processing
  And I want to retrieve previously created transactions by their identifier

  Background:
    Given I am authenticated with a valid API key

  Scenario: Replaying a payment with identical payload returns the existing transaction
    Given a payment transaction exists for "Nexus Corp" with 3200 "EUR" and an idempotency key
    When I submit an identical payment request using the same idempotency key
    Then the response should return status 200
    And the returned transaction ID should match the original transaction

  Scenario: Reusing an idempotency key with different data produces an idempotency conflict
    Given a payment transaction exists for "Atlas Logistics" with 4500 "INR" and an idempotency key
    When I submit a payment with the same idempotency key but amount 9000 "INR"
    Then the payment request should be rejected with status 409
    And the error code should be "IDEMPOTENCY_CONFLICT"

  Scenario: Successfully retrieve a payment by its transaction ID
    Given a payment transaction exists for "Horizon Media" with 1850 "USD"
    When I retrieve the transaction by its ID
    Then the response should return status 200
    And the retrieved transaction recipient should be "Horizon Media"
    And the retrieved amount should be 1850

Feature: Payment creation
  As an authorized merchant or customer
  I want to submit payment requests with validated minor-unit amounts and currencies
  So that transaction records are securely processed and persisted

  Background:
    Given I am authenticated with a valid API key

  Scenario: Successfully create a payment
    When I submit a payment for "Global Logistics Ltd" with 1050 "USD"
    Then the payment should be processed successfully with status "COMPLETED"
    And the transaction record in the database should match the payment details

  Scenario Outline: Reject payment creation with an invalid amount
    When I submit a payment for "Acme Supplies" with an invalid amount <amount> "USD"
    Then the payment request should be rejected with status 422
    And the error code should be "<errorCode>"

    Examples:
      | amount | errorCode            |
      | 0      | INVALID_AMOUNT_VALUE |
      | -250   | INVALID_AMOUNT_VALUE |

  Scenario: Reject payment creation with an unsupported currency
    When I submit a payment for "Tokyo Trading Co" with 2000 "JPY"
    Then the payment request should be rejected with status 422
    And the error code should be "UNSUPPORTED_CURRENCY"

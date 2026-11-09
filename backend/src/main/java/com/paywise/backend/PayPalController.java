
package com.paywise.backend;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/paypal")
@CrossOrigin(origins = "http://localhost:5173")
public class PayPalController {

    private final PayPalService payPalService;
    private final InvoiceRepository invoiceRepository;
    private final ExchangeRateService exchangeRateService;

    public PayPalController(
            PayPalService payPalService,
            InvoiceRepository invoiceRepository,
            ExchangeRateService exchangeRateService) {

        this.payPalService = payPalService;
        this.invoiceRepository = invoiceRepository;
        this.exchangeRateService = exchangeRateService;
    }

    // Create PayPal order using an existing INR invoice
    @PostMapping("/create-order")
    public ResponseEntity<?> createOrder(@RequestBody Map<String, Long> body) {

        try {
            Long invoiceId = body.get("invoiceId");

            if (invoiceId == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invoice ID is required."));
            }

            Optional<Invoice> optionalInvoice =
                    invoiceRepository.findById(invoiceId);

            if (optionalInvoice.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Invoice not found."));
            }

            Invoice invoice = optionalInvoice.get();

            if ("PAID".equalsIgnoreCase(invoice.getStatus())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "This invoice is already paid."));
            }

            if (invoice.getAmount() == null ||
                    invoice.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid invoice amount."));
            }

            // Fetch one exchange rate and use that same rate for conversion
            BigDecimal rate = exchangeRateService.getInrToUsdRate();

            BigDecimal usdAmount = invoice.getAmount()
                    .multiply(rate)
                    .setScale(2, RoundingMode.HALF_UP);

            if (usdAmount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Converted USD amount is too small."));
            }

            // Create PayPal order in USD
            JsonNode order = payPalService.createOrder(
                    usdAmount.toPlainString(), "USD");

            String orderId = order.path("id").asText();

            if (orderId.isBlank()) {
                throw new IllegalStateException(
                        "PayPal did not return an order ID.");
            }

            String approvalUrl = "";

            for (JsonNode link : order.path("links")) {
                if ("approve".equals(link.path("rel").asText())
                        || "payer-action".equals(link.path("rel").asText())) {
                    approvalUrl = link.path("href").asText();
                    break;
                }
            }

            if (approvalUrl.isBlank()) {
                throw new IllegalStateException(
                        "PayPal approval link was not returned.");
            }

            // Save PayPal details without changing the INR invoice amount
            invoice.setPaypalOrderId(orderId);
            invoice.setPaypalAmountUsd(usdAmount);
            invoice.setExchangeRateInrToUsd(rate);
            invoice.setExchangeRateDate(LocalDate.now());
            invoice.setPaymentStatus("CREATED");

            invoiceRepository.save(invoice);

            return ResponseEntity.ok(Map.of(
                    "invoiceId", invoice.getId(),
                    "orderId", orderId,
                    "status", order.path("status").asText(),
                    "approvalUrl", approvalUrl,
                    "invoiceAmountInr", invoice.getAmount(),
                    "paypalAmountUsd", usdAmount,
                    "exchangeRate", rate
            ));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));

        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }

            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "PayPal order creation failed."));

        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // Capture PayPal order and verify payment before marking invoice PAID
    @PostMapping("/capture/{orderId}")
    public ResponseEntity<?> captureOrder(@PathVariable String orderId) {

        try {
            Optional<Invoice> optionalInvoice =
                    invoiceRepository.findByPaypalOrderId(orderId);

            if (optionalInvoice.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "No invoice found for this PayPal order."));
            }

            Invoice invoice = optionalInvoice.get();

            // Prevent duplicate capture attempts for an already paid invoice
            if ("PAID".equalsIgnoreCase(invoice.getStatus())) {
                return ResponseEntity.ok(Map.of(
                        "orderId", orderId,
                        "status", "COMPLETED",
                        "paid", true,
                        "invoiceId", invoice.getId()
                ));
            }

            JsonNode result = payPalService.captureOrder(orderId);

            String returnedOrderId = result.path("id").asText();
            String status = result.path("status").asText();

            if (!orderId.equals(returnedOrderId)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "PayPal order ID verification failed."));
            }

            if (!"COMPLETED".equalsIgnoreCase(status)) {
                invoice.setPaymentStatus(status.isBlank() ? "UNKNOWN" : status);
                invoiceRepository.save(invoice);

                return ResponseEntity.ok(Map.of(
                        "orderId", orderId,
                        "status", status,
                        "paid", false
                ));
            }

            // Verify the actual captured amount and currency
            JsonNode capture = result.path("purchase_units")
                    .path(0)
                    .path("payments")
                    .path("captures")
                    .path(0);

            String capturedCurrency = capture.path("amount")
                    .path("currency_code").asText();

            String capturedValue = capture.path("amount")
                    .path("value").asText();

            if (capturedCurrency.isBlank() || capturedValue.isBlank()
                    || invoice.getPaypalAmountUsd() == null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "Could not verify captured payment details."));
            }

            BigDecimal actualAmount = new BigDecimal(capturedValue);

            if (!"USD".equalsIgnoreCase(capturedCurrency)
                    || actualAmount.compareTo(invoice.getPaypalAmountUsd()) != 0
                    || !"COMPLETED".equalsIgnoreCase(
                            capture.path("status").asText())) {

                invoice.setPaymentStatus("CAPTURE_VERIFICATION_FAILED");
                invoiceRepository.save(invoice);

                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "Payment amount or status verification failed."));
            }

            // Only verified successful payment can mark invoice as PAID
            invoice.setPaymentStatus("COMPLETED");
            invoice.setStatus("PAID");

            invoiceRepository.save(invoice);

            return ResponseEntity.ok(Map.of(
                    "invoiceId", invoice.getId(),
                    "orderId", orderId,
                    "status", "COMPLETED",
                    "paid", true,
                    "capturedAmountUsd", actualAmount
            ));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));

        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }

            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "PayPal payment capture failed."));

        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage()));
        }
    }
}

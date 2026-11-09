
package com.paywise.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class PayPalService {

    @Value("${PAYPAL_CLIENT_ID:}")
    private String clientId;

    @Value("${PAYPAL_CLIENT_SECRET:}")
    private String clientSecret;

    @Value("${PAYPAL_BASE_URL:https://api-m.sandbox.paypal.com}")
    private String baseUrl;

    private final ObjectMapper mapper = new ObjectMapper();

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    // Get PayPal access token
    private String getAccessToken()
            throws IOException, InterruptedException {

        if (clientId == null || clientId.isBlank()
                || clientSecret == null || clientSecret.isBlank()) {

            throw new IllegalStateException(
                    "PayPal credentials are missing from backend/.env");
        }

        String credentials = Base64.getEncoder().encodeToString(
                (clientId.trim() + ":" + clientSecret.trim())
                        .getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v1/oauth2/token"))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Basic " + credentials)
                .header("Content-Type",
                        "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "grant_type=client_credentials"))
                .build();

        HttpResponse<String> response = client.send(
                request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() < 200
                || response.statusCode() >= 300) {

            System.err.println(
                    "PayPal token HTTP status: "
                            + response.statusCode());

            System.err.println(response.body());

            throw new IOException(
                    "PayPal token request failed with HTTP "
                            + response.statusCode());
        }

        String accessToken = mapper.readTree(response.body())
                .path("access_token").asText();

        if (accessToken.isBlank()) {
            throw new IOException(
                    "PayPal access token was empty.");
        }

        return accessToken;
    }

    // Create PayPal order
    public JsonNode createOrder(String amount, String currency)
            throws IOException, InterruptedException {

        double value;

        try {
            value = Double.parseDouble(amount);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "Invalid payment amount.");
        }

        if (!Double.isFinite(value) || value <= 0) {
            throw new IllegalArgumentException(
                    "Payment amount must be greater than zero.");
        }

        if (!"USD".equals(currency)) {
            throw new IllegalArgumentException(
                    "This initial Sandbox test supports USD only.");
        }

        String token = getAccessToken();

        ObjectNode body = mapper.createObjectNode();
        body.put("intent", "CAPTURE");

        // PayPal checkout experience settings
        ObjectNode paypal =
                body.putObject("payment_source")
                    .putObject("paypal");

        ObjectNode experience =
                paypal.putObject("experience_context");

        experience.put("brand_name", "PayWise AI");
        experience.put("landing_page", "LOGIN");
        experience.put("user_action", "PAY_NOW");
        experience.put("shipping_preference", "NO_SHIPPING");

        experience.put(
                "return_url",
                "http://localhost:5173/paypal/success");

        experience.put(
                "cancel_url",
                "http://localhost:5173/paypal/cancel");

        // Purchase unit
        ObjectNode purchaseUnit =
                body.putArray("purchase_units").addObject();

        purchaseUnit.put(
                "description",
                "PayWise AI invoice payment");

        ObjectNode amountNode =
                purchaseUnit.putObject("amount");

        amountNode.put("currency_code", currency);

        amountNode.put(
                "value",
                String.format(Locale.US, "%.2f", value));

        // Send create-order request
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v2/checkout/orders"))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .header("PayPal-Request-Id",
                        UUID.randomUUID().toString())
                .POST(HttpRequest.BodyPublishers.ofString(
                        mapper.writeValueAsString(body)))
                .build();

        HttpResponse<String> response = client.send(
                request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() < 200
                || response.statusCode() >= 300) {

            System.err.println(
                    "PayPal create-order HTTP status: "
                            + response.statusCode());

            System.err.println(
                    "PayPal create-order error: "
                            + response.body());

            throw new IOException(
                    "PayPal order creation failed with HTTP "
                            + response.statusCode());
        }

        // Debug: Print PayPal order response
        System.out.println(
                "========== PAYPAL ORDER RESPONSE ==========");

        System.out.println(response.body());

        System.out.println(
                "============================================");

        return mapper.readTree(response.body());
    }

    // Capture payment after buyer approval
    public JsonNode captureOrder(String orderId)
            throws IOException, InterruptedException {

        if (orderId == null
                || !orderId.matches("[A-Za-z0-9-]{1,100}")) {

            throw new IllegalArgumentException(
                    "Invalid PayPal order ID.");
        }

        String token = getAccessToken();

        String encodedOrderId = URLEncoder.encode(
                orderId, StandardCharsets.UTF_8);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(
                        baseUrl + "/v2/checkout/orders/"
                                + encodedOrderId + "/capture"))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();

        HttpResponse<String> response = client.send(
                request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() < 200
                || response.statusCode() >= 300) {

            System.err.println(
                    "PayPal capture HTTP status: "
                            + response.statusCode());

            System.err.println(
                    "PayPal capture error: "
                            + response.body());

            throw new IOException(
                    "PayPal capture failed with HTTP "
                            + response.statusCode());
        }

        JsonNode captureResponse =
                mapper.readTree(response.body());

        System.out.println(
                "========== PAYPAL CAPTURE RESPONSE ==========");

        System.out.println(response.body());

        System.out.println(
                "===============================================");

        return captureResponse;
    }
}

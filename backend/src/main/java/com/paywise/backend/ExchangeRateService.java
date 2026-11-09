
package com.paywise.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
public class ExchangeRateService {

    @Value("${exchange.rate.api.url}")
    private String exchangeRateApiUrl;

    private final ObjectMapper objectMapper;

    public ExchangeRateService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public BigDecimal getInrToUsdRate() {
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(exchangeRateApiUrl))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = client.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() != 200) {
                throw new IllegalStateException(
                        "Exchange rate API is unavailable."
                );
            }

          JsonNode json = objectMapper.readTree(response.body());

if (!"success".equals(json.path("result").asText())) {
    throw new IllegalStateException("Exchange rate API returned an error.");
}

if (!"INR".equals(json.path("base_code").asText())) {
    throw new IllegalStateException("Unexpected base currency.");
}

JsonNode rateNode = json.path("rates").path("USD");

            if (rateNode.isMissingNode() || !rateNode.isNumber()) {
                throw new IllegalStateException(
                        "Invalid exchange rate response."
                );
            }

            BigDecimal rate = rateNode.decimalValue();

            if (rate.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalStateException(
                        "Invalid exchange rate."
                );
            }

            return rate;

} catch (InterruptedException e) {
    Thread.currentThread().interrupt();

    System.err.println("Exchange rate request interrupted: " + e.getMessage());

    throw new IllegalStateException(
            "Exchange rate request was interrupted.", e
    );

} catch (Exception e) {
    System.err.println(
            "Exchange rate API error: "
            + e.getClass().getSimpleName()
            + " - "
            + e.getMessage()
    );

    throw new IllegalStateException(
            "Could not retrieve INR to USD exchange rate: "
            + e.getMessage(), e
    );
}
    }

    public BigDecimal convertInrToUsd(BigDecimal inrAmount) {
        if (inrAmount == null ||
                inrAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(
                    "Invoice amount must be greater than zero."
            );
        }

        return inrAmount.multiply(getInrToUsdRate())
                .setScale(2, java.math.RoundingMode.HALF_UP);
    }
}

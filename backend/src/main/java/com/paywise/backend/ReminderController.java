
package com.paywise.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class ReminderController {

    @Value("${GROQ_API_KEY:}")
    private String groqApiKey;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    // Generate English payment reminder
    @GetMapping("/api/reminders/generate")
    public ResponseEntity<String> generateReminder(
            @RequestParam String customerName,
            @RequestParam String description,
            @RequestParam String amount,
            @RequestParam String dueDate) {

        String prompt = """
                You are PayWise AI, a professional business payment assistant.

                Write a polite, friendly and professional payment reminder.

                Customer: %s
                Invoice description: %s
                Amount: INR %s
                Due date: %s

                Requirements:
                - Address the customer by name.
                - Mention the invoice description and amount.
                - Clearly mention the due date.
                - If the due date has passed, politely mention that payment
                  may be overdue. Otherwise, use a normal reminder.
                - Ask the customer to arrange payment.
                - End with a professional thank-you.
                - Keep the message concise and ready to send.
                - Do not invent payment links or claim payment was made.
                - Return only the reminder message.
                """.formatted(customerName, description, amount, dueDate);

        try {
            String reminder = callGroq(prompt, 300);
            return ResponseEntity.ok(reminder);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("The reminder request was interrupted.");

        } catch (IOException e) {
            System.err.println("English reminder error: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("Could not generate the English reminder. Check backend terminal.");
        }
    }

    // Translate English reminder into Tamil
    @PostMapping("/api/reminders/translate-tamil")
    public ResponseEntity<Map<String, String>> translateToTamil(
            @RequestBody Map<String, String> requestBody) {

        String englishText = requestBody.get("text");

        if (englishText == null || englishText.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Reminder text is required."));
        }

        String prompt = """
                You are a professional English-to-Tamil translator.

                Translate the following payment reminder into natural,
                polite and professional Tamil.

                Requirements:
                - Preserve the customer's name.
                - Preserve the invoice amount and due date exactly.
                - Do not change the meaning.
                - Use clear, simple Tamil.
                - Return only the Tamil translation.
                - Do not add explanations or English text.

                English reminder:
                %s
                """.formatted(englishText);

        try {
            String tamilText = callGroq(prompt, 500);

            return ResponseEntity.ok(
                    Map.of("tamilText", tamilText)
            );

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Tamil translation was interrupted."));

        } catch (IOException e) {
            System.err.println("Tamil translation error: " + e.getMessage());

            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Could not translate the reminder. Check backend terminal."));
        }
    }

    // Common Groq API method used by both features
    private String callGroq(String prompt, int maxTokens)
            throws IOException, InterruptedException {

        if (groqApiKey == null || groqApiKey.isBlank()) {
            throw new IOException("Groq API key is missing. Check backend/.env.");
        }

        ObjectNode requestBody = objectMapper.createObjectNode();

        requestBody.put("model", "openai/gpt-oss-20b");
        requestBody.put("temperature", 0.3);
        requestBody.put("max_tokens", maxTokens);

        ArrayNode messages = requestBody.putArray("messages");

        ObjectNode message = messages.addObject();
        message.put("role", "user");
        message.put("content", prompt);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(
                        "https://api.groq.com/openai/v1/chat/completions"))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + groqApiKey.trim())
                .POST(HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(requestBody)))
                .build();

        HttpResponse<String> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            System.err.println("Groq HTTP status: " + response.statusCode());
            System.err.println("Groq response: " + response.body());

            throw new IOException(
                    "Groq request failed with HTTP status " + response.statusCode());
        }

        JsonNode json = objectMapper.readTree(response.body());

        JsonNode textNode = json.path("choices")
                .path(0)
                .path("message")
                .path("content");

        if (textNode.isMissingNode() || textNode.asText().isBlank()) {
            throw new IOException("Groq returned an empty response.");
        }

        return textNode.asText().trim();
    }
}

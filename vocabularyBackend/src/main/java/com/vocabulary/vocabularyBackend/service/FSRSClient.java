package com.vocabulary.vocabularyBackend.service;

import com.vocabulary.vocabularyBackend.dto.FSRSCardDTO;
import com.vocabulary.vocabularyBackend.dto.FSRSReviewRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class FSRSClient {
    private static final Logger logger = LoggerFactory.getLogger(FSRSClient.class);

    private final RestTemplate restTemplate;
    private final String fsrsServiceUrl = "http://localhost:6000";

    public FSRSClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public FSRSCardDTO reviewCard(FSRSCardDTO cardDTO, Integer rating, String reviewTime) {
        String endpoint = fsrsServiceUrl + "/review";

        // Build request payload
        FSRSReviewRequest request = new FSRSReviewRequest(cardDTO, rating, reviewTime);

        logger.info("Calling FSRS service: rating={}, state={}", rating, cardDTO.getState());

        try {
            // Make HTTP POST request
            FSRSCardDTO response = restTemplate.postForObject(
                    endpoint,
                    request,
                    FSRSCardDTO.class // Response type
            );

            if (response == null) {
                throw new RuntimeException("FSRS service returned null response");
            }

            logger.info("FSRS response: new_state={}, new_due={}",
                    response.getState(), response.getDue());

            return response;

        } catch (org.springframework.web.client.ResourceAccessException e) {
            // Connection error (service down or timeout)
            logger.error("Failed to connect to FSRS service at {}: {}", endpoint, e.getMessage());
            throw new RuntimeException("FSRS service unavailable. Is the Python service running on port 6000?", e);

        } catch (org.springframework.web.client.HttpClientErrorException e) {
            // HTTP 4xx error (bad request)
            logger.error("FSRS service rejected request: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("Invalid card data sent to FSRS service", e);

        } catch (org.springframework.web.client.HttpServerErrorException e) {
            // HTTP 5xx error (server error)
            logger.error("FSRS service internal error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("FSRS service encountered an error", e);

        } catch (Exception e) {
            // Any other unexpected error
            logger.error("Unexpected error calling FSRS service: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to process FSRS review", e);
        }
    }
}

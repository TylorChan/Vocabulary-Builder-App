package com.vocabulary.vocabularyBackend.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;


/**
 * Spring configuration for HTTP clients.
 * Provides RestTemplate bean for making HTTP requests to external services.
 */
@Configuration
public class RestTemplateConfig {

    /**
     * Creates a RestTemplate bean with timeouts configured.
     * Used by FSRSClient to call the Python FSRS microservice.
     */
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(5))  // Connection timeout
                .setReadTimeout(Duration.ofSeconds(5))     // Read timeout
                .build();
    }
}


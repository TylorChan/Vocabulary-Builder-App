package com.vocabulary.vocabularyBackend.controller;

import com.vocabulary.vocabularyBackend.dto.FSRSCardDTO;
import com.vocabulary.vocabularyBackend.service.FSRSClient;
import org.springframework.web.bind.annotation.*;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * TEMPORARY test controller to verify FSRSClient integration.
 * DELETE THIS FILE after testing is complete.
 */
@RestController
@RequestMapping("/api/test")
public class FSRSTestController {

    private final FSRSClient fsrsClient;

    public FSRSTestController(FSRSClient fsrsClient) {
        this.fsrsClient = fsrsClient;
    }

    /**
     * Test endpoint: Send a sample card to FSRS service.
     * <p>
     * Example: GET http://localhost:8080/api/test/fsrs?rating=4
     */
    @GetMapping("/fsrs")
    public FSRSCardDTO testFSRS(@RequestParam(defaultValue = "3") Integer rating) {

        // Create a sample card (NEW state, first review)
        FSRSCardDTO testCard = new FSRSCardDTO();
//        testCard.setDue(ZonedDateTime.now().format(DateTimeFormatter.ISO_INSTANT));
        String reviewTime = ZonedDateTime.now().format(DateTimeFormatter.ISO_INSTANT);

        // Call Python FSRS service
        return fsrsClient.reviewCard(testCard, rating, reviewTime);
    }
}



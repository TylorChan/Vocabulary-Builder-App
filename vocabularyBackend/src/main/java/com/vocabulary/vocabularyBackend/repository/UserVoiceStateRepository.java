package com.vocabulary.vocabularyBackend.repository;

import com.vocabulary.vocabularyBackend.model.UserVoiceState;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserVoiceStateRepository extends MongoRepository<UserVoiceState, String> {

    Optional<UserVoiceState> findByUserId(String userId);
}

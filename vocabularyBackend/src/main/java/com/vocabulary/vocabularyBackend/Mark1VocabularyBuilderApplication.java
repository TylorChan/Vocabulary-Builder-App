package com.vocabulary.vocabularyBackend;

import com.vocabulary.vocabularyBackend.model.VocabularyEntry;
import com.vocabulary.vocabularyBackend.repository.VocabularyRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

import java.util.ArrayList;
import java.util.List;

@SpringBootApplication
@EnableMongoRepositories
public class Mark1VocabularyBuilderApplication implements CommandLineRunner {
	@Autowired
	VocabularyRepository vocabularyRepository;

	List<VocabularyEntry> vocabularyEntries = new ArrayList<>();

	public static void main(String[] args) {
		SpringApplication.run(Mark1VocabularyBuilderApplication.class, args);
	}

	@Override
	public void run(String... args) throws Exception {
		// This method runs automatically after Spring Boot starts
		// Use it for initialization code, testing, or database seeding

		System.out.println("Application started successfully!");
		System.out.println("Total vocabulary entries in database: " + vocabularyRepository.count());

		// Example: Add test data with realistic vocabulary entries

		// Entry 2: Phrase - Idiomatic expression
		VocabularyEntry entry2 = new VocabularyEntry();
		entry2.setText("break the ice");
		entry2.setDefinition("To make people feel more comfortable in a social situation, especially at the beginning of a meeting or conversation");
		entry2.setExample("He told a funny joke to break the ice at the networking event.");
		entry2.setExampleTrans("他讲了一个有趣的笑话来打破社交活动上的僵局。");
		entry2.setRealLifeDef("Perfect for starting conversations at parties, job interviews, or any awkward social situation. Common ice-breakers include talking about weather, asking about someone's weekend, or sharing a light joke.");
		entry2.setSurroundingText("When meeting new people, it's important to break the ice. A simple compliment or question can start a great conversation.");
		entry2.setVideoTitle("Essential English Phrases for Networking");
		entry2.setUserId("test-user");
		vocabularyRepository.save(entry2);

		// Entry 3: Academic term - Science vocabulary
		VocabularyEntry entry3 = new VocabularyEntry();
		entry3.setText("photosynthesis");
		entry3.setDefinition("The process by which green plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar");
		entry3.setExample("During photosynthesis, plants convert light energy into chemical energy.");
		entry3.setExampleTrans("在光合作用过程中，植物将光能转化为化学能。");
		entry3.setRealLifeDef("This is how plants 'eat' - they make their own food using sunlight. It's why plants need sun and water to survive, and why they're called 'producers' in the food chain.");
		entry3.setSurroundingText("All life on Earth depends on photosynthesis. Without it, we wouldn't have oxygen to breathe or food to eat.");
		entry3.setVideoTitle("How Plants Create Energy - Biology Explained");
		entry3.setUserId("test-user");
		vocabularyRepository.save(entry3);

		System.out.println("Total vocabulary entries in database: " + vocabularyRepository.count());
	}
}

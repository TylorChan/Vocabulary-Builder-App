from flask import Flask, request, jsonify
from flask_cors import CORS
from fsrs import Scheduler, Card, Rating, State  
from datetime import datetime, timezone
import logging

def to_utc_aware(dt):
    """Ensure datetime is timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Treat naive as UTC
        return dt.replace(tzinfo=timezone.utc)
    # Convert any offset-aware dt to UTC
    return dt.astimezone(timezone.utc)

# Initialize Flask application
app = Flask(__name__)

# Enable CORS (allows Spring Boot to call this service)
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FSRS scheduler with default parameters
scheduler = Scheduler() 

logger.info("FSRS Service initialized successfully")

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint for Docker/monitoring.
    
    Returns:
        JSON response with status and service name
    
    Example:
        GET http://localhost:5000/health
        Response: {"status": "healthy", "service": "fsrs-scheduler"}
    """
    return jsonify({
        "status": "healthy",
        "service": "fsrs-scheduler",
        "version": "1.0.0"
    })

@app.route('/review', methods=['POST'])
def review_card():
    """
    Calculate next FSRS schedule based on review performance.
    
    Expected JSON body:
    {
        "card": {
            "difficulty": 5.0,
            "stability": 2.5,
            "due": "2025-01-18T10:30:00Z",
            "state": "REVIEW",
            "last_review": "2025-01-15T10:30:00Z",
            "reps": 3
        },
        "rating": 3,  # 1=Again, 2=Hard, 3=Good, 4=Easy
        "review_time": "2025-01-18T14:00:00Z"
    }
    
    Returns updated card with new difficulty, stability, due date.
    """
    try:
        # Get JSON data from request body
        data = request.json

        # Parse input card data
        card_data = data['card']
        rating_value = data['rating']
        review_time_str = data.get('review_time', datetime.now(timezone.utc).isoformat())

        state_str = card_data.get('state', 'LEARNING')  # Default to LEARNING
        state_map = {
            'LEARNING': State.Learning,
            'REVIEW': State.Review,
            'RELEARNING': State.Relearning
        }
        card_state = state_map.get(state_str, State.Learning)

        
        due_str = card_data.get('due')
        due_datetime = datetime.fromisoformat(due_str.replace('Z', '+00:00')) if due_str else datetime.now(timezone.utc)
        due_datetime = to_utc_aware(due_datetime)

        last_review_str = card_data.get('last_review')
        last_review_datetime = datetime.fromisoformat(last_review_str.replace('Z', '+00:00')) if last_review_str else None
        last_review_datetime = to_utc_aware(last_review_datetime)

        card = Card(
            difficulty=card_data.get('difficulty'),
            stability=card_data.get('stability'),  
            due=due_datetime,
            state=card_state,
            last_review=last_review_datetime,
            step=card_data.get('step', 0)
        )

        # Convert rating (1-4) to Rating enum
        rating = Rating(rating_value)

        # Convert review time
        review_time = datetime.fromisoformat(review_time_str.replace('Z', '+00:00'))
        review_time = to_utc_aware(review_time)
        
        # Run FSRS algorithm 
        updated_card, review_log = scheduler.review_card(
            card=card,
            rating=rating,
            review_datetime=review_time
        )

        # Convert back to JSON
        result = {
            "difficulty": updated_card.difficulty,
            "stability": updated_card.stability,
            "state": updated_card.state.name,
            "due": updated_card.due.astimezone(timezone.utc).isoformat(),
            "last_review": updated_card.last_review.astimezone(timezone.utc).isoformat() if updated_card.last_review else None,
            "step": updated_card.step
        }

        logger.info(f"Reviewed card: rating={rating_value}, old_state={card.state.name}, new_state={updated_card.state.name}")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error processing review: {str(e)}")
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    # Get port from environment variable (for Docker flexibility)
    import os
    port = int(os.environ.get('PORT', 6000))

    logger.info(f"Starting FSRS service on port {port}")

    # Run Flask development server
    app.run(
        host='0.0.0.0',  # Listen on all network interfaces (required for Docker)
        port=port,
        debug=True       # Enable auto-reload and detailed error pages
    )

"""
Entry point to run the 2-Player Online Number Guessing Game Server.
"""
import uvicorn
from server.config import settings

if __name__ == "__main__":
    print(f"Starting Vinay Number Guessing Activity Server on {settings.HOST}:{settings.PORT}")
    print(f"Open http://localhost:{settings.PORT} in your browser to play!")
    uvicorn.run("server.app:app", host=settings.HOST, port=settings.PORT, reload=False)

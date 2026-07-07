import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler

class StructuredFormatter(logging.Formatter):
    def format(self, record):
        # Format the basic string
        timestamp = datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        level = record.levelname.ljust(8)
        name = record.name
        message = record.getMessage()

        # Extract extra fields
        standard_fields = {
            'args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
            'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs',
            'message', 'msg', 'name', 'pathname', 'process', 'processName',
            'relativeCreated', 'stack_info', 'thread', 'threadName', 'color_message'
        }
        
        extra_fields = []
        for key, value in record.__dict__.items():
            if key not in standard_fields and not key.startswith('_'):
                extra_fields.append(f"{key}={value}")
        
        extra_str = " ".join(extra_fields)
        
        log_line = f"{timestamp} | {level} | {name} | {message}"
        if extra_str:
            log_line += f" | {extra_str}"
            
        if record.exc_text:
            log_line += f"\n{record.exc_text}"
            
        return log_line

def setup_logging():
    log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    
    # Create logs directory if it doesn't exist
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logs_dir = os.path.join(project_root, "logs")
    os.makedirs(logs_dir, exist_ok=True)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    formatter = StructuredFormatter()
    
    # Stream Handler (stdout)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    stream_handler.setLevel(log_level)
    root_logger.addHandler(stream_handler)
    
    # Rotating File Handler
    log_file = os.path.join(logs_dir, "cognee.log")
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10*1024*1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(log_level)
    root_logger.addHandler(file_handler)
    
    # Ensure our app namespace logs at least at DEBUG if LOG_LEVEL allows
    app_logger = logging.getLogger("app")
    app_logger.setLevel(log_level)
    
    # Suppress verbose third-party loggers
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("litellm").setLevel(logging.WARNING)

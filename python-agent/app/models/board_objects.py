from pydantic import BaseModel
from typing import Literal


class BoardAction(BaseModel):
    """A single action to perform on the CollabBoard canvas.

    Returned by the Python agent to Node.js, which resolves temp_ids,
    writes to PostgreSQL, and broadcasts via Socket.IO.
    """

    action: Literal["create", "update", "delete"]
    object_type: Literal["sticky", "rect", "circle", "text", "frame", "connector", "image"]
    temp_id: str | None = None
    object_id: str | None = None
    props: dict

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "action": "create",
                    "object_type": "sticky",
                    "temp_id": "task-1",
                    "props": {
                        "text": "User Research",
                        "x": 100,
                        "y": 100,
                        "width": 200,
                        "height": 200,
                        "color": "#FEF08A",
                        "font_size": 14,
                        "rotation": 0,
                    },
                }
            ]
        }

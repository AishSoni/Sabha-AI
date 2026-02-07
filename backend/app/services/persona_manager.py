"""
Persona manager service - handles persona lifecycle and persistence.
"""

from typing import Optional, List
from datetime import datetime
import uuid

from app.core.database import get_supabase
from app.models import (
    Persona,
    PersonaCreate,
    PersonaUpdate,
    PersonaWithPrompt,
    PromptVersion,
    PromptVersionCreate,
)


class PersonaManager:
    """Manages persona lifecycle and database operations."""
    
    def __init__(self):
        self.db = get_supabase()
    
    async def create_persona(self, data: PersonaCreate) -> PersonaWithPrompt:
        """Create a new persona with initial prompt version."""
        
        persona_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        # Insert persona
        persona_data = {
            "id": persona_id,
            "name": data.name,
            "subtitle": data.subtitle,
            "color": data.color,
            "avatar_url": data.avatar_url,
            "provider_config": data.provider_config.model_dump(),
            "is_default": data.is_default,
            "user_id": data.user_id,
            "created_at": now,
            "updated_at": now,
        }
        
        result = self.db.table("personas").insert(persona_data).execute()
        persona = result.data[0]
        
        # Create initial prompt version if provided
        active_prompt = None
        active_version = None
        if data.system_prompt:
            prompt_version = await self.create_prompt_version(
                persona_id, 
                PromptVersionCreate(content=data.system_prompt)
            )
            active_prompt = prompt_version.content
            active_version = prompt_version.version
        
        return PersonaWithPrompt(
            **persona,
            active_prompt=active_prompt,
            active_prompt_version=active_version,
        )
    
    async def get_persona(self, persona_id: str) -> Optional[PersonaWithPrompt]:
        """Get a persona with its active prompt."""
        
        # Fetch persona
        result = self.db.table("personas") \
            .select("*") \
            .eq("id", persona_id) \
            .execute()
        
        if not result.data:
            return None
        
        persona = result.data[0]
        
        # Fetch active prompt
        prompt_result = self.db.table("prompt_versions") \
            .select("*") \
            .eq("persona_id", persona_id) \
            .eq("is_active", True) \
            .execute()
        
        active_prompt = None
        active_version = None
        if prompt_result.data:
            active_prompt = prompt_result.data[0]["content"]
            active_version = prompt_result.data[0]["version"]
        
        return PersonaWithPrompt(
            **persona,
            active_prompt=active_prompt,
            active_prompt_version=active_version,
        )
    
    async def list_personas(self, user_id: Optional[str] = None, include_defaults: bool = True) -> List[PersonaWithPrompt]:
        """List all personas, optionally filtered by user."""
        
        query = self.db.table("personas").select("*")
        
        if user_id:
            if include_defaults:
                # Get user's personas + default personas
                query = query.or_(f"user_id.eq.{user_id},is_default.eq.true")
            else:
                query = query.eq("user_id", user_id)
        # When no user_id is specified, return all personas (no filter needed)
        
        result = query.order("created_at", desc=True).execute()
        
        personas = []
        for p in result.data:
            # Fetch active prompt for each persona
            prompt_result = self.db.table("prompt_versions") \
                .select("content, version") \
                .eq("persona_id", p["id"]) \
                .eq("is_active", True) \
                .execute()
            
            active_prompt = None
            active_version = None
            if prompt_result.data:
                active_prompt = prompt_result.data[0]["content"]
                active_version = prompt_result.data[0]["version"]
            
            personas.append(PersonaWithPrompt(
                **p,
                active_prompt=active_prompt,
                active_prompt_version=active_version,
            ))
        
        return personas
    
    async def update_persona(self, persona_id: str, data: PersonaUpdate) -> Optional[PersonaWithPrompt]:
        """Update persona metadata (not prompt)."""
        
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.subtitle is not None:
            update_data["subtitle"] = data.subtitle
        if data.color is not None:
            update_data["color"] = data.color
        if data.avatar_url is not None:
            update_data["avatar_url"] = data.avatar_url
        if data.provider_config is not None:
            update_data["provider_config"] = data.provider_config.model_dump()
        
        if not update_data:
            return await self.get_persona(persona_id)
        
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        self.db.table("personas") \
            .update(update_data) \
            .eq("id", persona_id) \
            .execute()
        
        return await self.get_persona(persona_id)
    
    async def delete_persona(self, persona_id: str) -> bool:
        """Delete a persona and all its prompt versions."""
        
        # Delete prompt versions first (cascade should handle this but be explicit)
        self.db.table("prompt_versions") \
            .delete() \
            .eq("persona_id", persona_id) \
            .execute()
        
        # Delete persona
        result = self.db.table("personas") \
            .delete() \
            .eq("id", persona_id) \
            .execute()
        
        return len(result.data) > 0
    
    # ============== Prompt Version Methods ==============
    
    async def create_prompt_version(self, persona_id: str, data: PromptVersionCreate) -> PromptVersion:
        """Create a new prompt version and set it as active."""
        
        # Get current max version
        max_result = self.db.table("prompt_versions") \
            .select("version") \
            .eq("persona_id", persona_id) \
            .order("version", desc=True) \
            .limit(1) \
            .execute()
        
        new_version = 1
        if max_result.data:
            new_version = max_result.data[0]["version"] + 1
        
        # Deactivate all existing versions
        self.db.table("prompt_versions") \
            .update({"is_active": False}) \
            .eq("persona_id", persona_id) \
            .execute()
        
        # Create new version
        version_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        version_data = {
            "id": version_id,
            "persona_id": persona_id,
            "version": new_version,
            "content": data.content,
            "is_active": True,
            "created_at": now,
        }
        
        result = self.db.table("prompt_versions").insert(version_data).execute()
        
        # Update persona's updated_at
        self.db.table("personas") \
            .update({"updated_at": now}) \
            .eq("id", persona_id) \
            .execute()
        
        return PromptVersion(**result.data[0])
    
    async def list_prompt_versions(self, persona_id: str) -> List[PromptVersion]:
        """List all prompt versions for a persona."""
        
        result = self.db.table("prompt_versions") \
            .select("*") \
            .eq("persona_id", persona_id) \
            .order("version", desc=True) \
            .execute()
        
        return [PromptVersion(**v) for v in result.data]
    
    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        """Activate a specific prompt version."""
        
        # Deactivate all versions
        self.db.table("prompt_versions") \
            .update({"is_active": False}) \
            .eq("persona_id", persona_id) \
            .execute()
        
        # Activate the specified version
        result = self.db.table("prompt_versions") \
            .update({"is_active": True}) \
            .eq("persona_id", persona_id) \
            .eq("version", version) \
            .execute()
        
        if result.data:
            self.db.table("personas") \
                .update({"updated_at": datetime.utcnow().isoformat()}) \
                .eq("id", persona_id) \
                .execute()
            return True
        
        return False

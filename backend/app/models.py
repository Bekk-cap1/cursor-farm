from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    phone: Optional[str] = Field(default=None, index=True)
    first_name: str = Field(default="", max_length=120)
    last_name: str = Field(default="", max_length=120)
    niche: Optional[str] = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    farms: list["Farm"] = Relationship(back_populates="owner")
    memberships: list["FarmMembership"] = Relationship(back_populates="user")


class Farm(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    name: str
    region: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: str = "Asia/Tashkent"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    owner: Optional[User] = Relationship(back_populates="farms")
    zones: list["FieldZone"] = Relationship(back_populates="farm", cascade_delete=True)
    herds: list["HerdGroup"] = Relationship(back_populates="farm", cascade_delete=True)
    tasks: list["Task"] = Relationship(back_populates="farm", cascade_delete=True)
    memberships: list["FarmMembership"] = Relationship(back_populates="farm", cascade_delete=True)


class FarmMembership(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("farm_id", "user_id", name="uq_farm_membership_farm_user"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    farm_id: int = Field(foreign_key="farm.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str = Field(default="manager")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    farm: Optional[Farm] = Relationship(back_populates="memberships")
    user: Optional[User] = Relationship(back_populates="memberships")


class FieldZone(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    farm_id: int = Field(foreign_key="farm.id", index=True)
    name: str
    area_ha: Optional[float] = None
    crop_type: Optional[str] = None
    irrigation_type: str = "drip"
    soil_moisture_0_5: Optional[int] = Field(default=None, description="0 сухо — 5 мокро")
    soil_ph: Optional[float] = Field(default=None, description="pH почвы (опционально, с датчиков)")
    soil_ec_ds_m: Optional[float] = Field(default=None, description="EC, дСм/м")
    soil_temp_c: Optional[float] = Field(default=None, description="Температура подстила, °C")

    farm: Optional[Farm] = Relationship(back_populates="zones")
    telemetry_readings: list["TelemetryReading"] = Relationship(
        back_populates="zone",
        cascade_delete=True,
    )


class TelemetryReading(SQLModel, table=True):
    """История показаний по зоне (фаза A полноценного продукта — ТЗ)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    zone_id: int = Field(foreign_key="fieldzone.id", index=True)
    metric: str = Field(index=True, max_length=64)
    value: float
    source: str = Field(default="sensor", max_length=32)
    recorded_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    zone: Optional[FieldZone] = Relationship(back_populates="telemetry_readings")


class HerdGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    farm_id: int = Field(foreign_key="farm.id", index=True)
    name: str
    animal_type: str = "cattle"
    head_count: int = 0
    feeding_notes: Optional[str] = Field(default=None, sa_column=Column(Text))

    farm: Optional[Farm] = Relationship(back_populates="herds")


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    farm_id: int = Field(foreign_key="farm.id", index=True)
    title: str
    kind: str = "other"
    status: str = "pending"
    due_at: Optional[datetime] = None
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    source: str = "user"

    farm: Optional[Farm] = Relationship(back_populates="tasks")


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    farm_id: int = Field(foreign_key="farm.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    action: str
    entity_type: str = ""
    entity_id: Optional[int] = None
    meta_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str
    body: str = ""
    read_at: Optional[datetime] = None
    farm_id: Optional[int] = Field(default=None, foreign_key="farm.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

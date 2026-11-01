"""SQLAlchemy ORM 模型 —— 对应前端 mock 数据结构的 9 张表。
纯列定义；序列化由 routers 按前端期望字段手动组装，避免 lazy loading 复杂度。
"""
from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RoomType(Base):
    __tablename__ = "room_type"
    code = mapped_column(String(16), primary_key=True)
    name = mapped_column(String(64), nullable=False)
    base_price = mapped_column(Integer, nullable=False)
    capacity = mapped_column(Integer, nullable=False)
    size = mapped_column(Integer, nullable=False)


class Staff(Base):
    __tablename__ = "staff"
    id = mapped_column(String(16), primary_key=True)
    name = mapped_column(String(64), nullable=False)
    account = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash = mapped_column(String(128), nullable=False)
    role = mapped_column(String(32), nullable=False)
    phone = mapped_column(String(32), nullable=False)
    status = mapped_column(String(16), nullable=False, default="active")


class Room(Base):
    __tablename__ = "room"
    no = mapped_column(String(8), primary_key=True)
    floor = mapped_column(Integer, nullable=False)
    type_code = mapped_column(String(16), ForeignKey("room_type.code"), nullable=False)
    status = mapped_column(String(8), nullable=False, default="OK")  # OK 空净 / VD 空脏 / OC 在住 / OO 停用
    booking_id = mapped_column(String(16), nullable=True)
    ooo_note = mapped_column(Text, nullable=True)


class Guest(Base):
    __tablename__ = "guest"
    id = mapped_column(String(16), primary_key=True)
    name = mapped_column(String(64), nullable=False)
    phone = mapped_column(String(32), unique=True, nullable=False, index=True)
    id_card_masked = mapped_column(String(32), nullable=True)
    vip = mapped_column(String(16), nullable=False, default="普通")
    tags = mapped_column(JSON, nullable=False, default=list)
    notes = mapped_column(Text, nullable=True)
    stays = mapped_column(Integer, nullable=False, default=0)
    spend = mapped_column(Integer, nullable=False, default=0)
    created_at = mapped_column(Date, nullable=False)


class Booking(Base):
    __tablename__ = "booking"
    id = mapped_column(String(16), primary_key=True)
    guest_name = mapped_column(String(64), nullable=False)
    phone = mapped_column(String(32), nullable=False)
    type_code = mapped_column(String(16), ForeignKey("room_type.code"), nullable=False)
    source = mapped_column(String(16), nullable=False)
    arrive = mapped_column(Date, nullable=False)
    depart = mapped_column(Date, nullable=False)
    nights = mapped_column(Integer, nullable=False)
    price = mapped_column(Integer, nullable=False)
    deposit = mapped_column(Integer, nullable=False, default=0)
    room_no = mapped_column(String(8), ForeignKey("room.no"), nullable=True)
    status = mapped_column(String(16), nullable=False)  # confirmed/checkedin/checkedout/cancelled/noshow
    memo = mapped_column(Text, nullable=True)
    created_at = mapped_column(Date, nullable=False)


class Folio(Base):
    __tablename__ = "folio"
    id = mapped_column(String(16), primary_key=True)
    booking_id = mapped_column(String(16), nullable=True)
    room_no = mapped_column(String(8), nullable=True)
    guest_name = mapped_column(String(64), nullable=False)
    deposit = mapped_column(Integer, nullable=False, default=0)
    status = mapped_column(String(16), nullable=False, default="open")  # open/settled
    settled_at = mapped_column(String(32), nullable=True)
    settled_total = mapped_column(Integer, nullable=False, default=0)
    invoice = mapped_column(Boolean, nullable=False, default=False)


class FolioItem(Base):
    __tablename__ = "folio_item"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    folio_id = mapped_column(String(16), ForeignKey("folio.id"), nullable=False, index=True)
    kind = mapped_column(String(16), nullable=False)  # extra 消费 / payment 收款
    name = mapped_column(String(128), nullable=False)
    category = mapped_column(String(32), nullable=True)
    qty = mapped_column(Integer, nullable=False, default=1)
    amount = mapped_column(Integer, nullable=False, default=0)
    method = mapped_column(String(32), nullable=True)  # 收款方式
    note = mapped_column(Text, nullable=True)
    time = mapped_column(String(32), nullable=True)
    void = mapped_column(Boolean, nullable=False, default=False)  # 是否作废


class Task(Base):
    __tablename__ = "task"
    id = mapped_column(String(16), primary_key=True)
    room_no = mapped_column(String(8), ForeignKey("room.no"), nullable=False, index=True)
    type = mapped_column(String(16), nullable=False)  # cleaning 清洁 / maintenance 维修
    status = mapped_column(String(16), nullable=False, default="pending")  # pending/doing/done
    assignee = mapped_column(String(64), nullable=True)
    note = mapped_column(Text, nullable=True)
    created_at = mapped_column(String(32), nullable=True)
    done_at = mapped_column(String(32), nullable=True)


class DailyStat(Base):
    __tablename__ = "daily_stat"
    date = mapped_column(Date, primary_key=True)
    occ = mapped_column(Integer, nullable=False)        # 出租率 %
    rooms_sold = mapped_column(Integer, nullable=False)
    adr = mapped_column(Integer, nullable=False)        # 平均房价
    revenue = mapped_column(Integer, nullable=False)
    revpar = mapped_column(Integer, nullable=False)     # 每可售房收入

"""P01-TEST02: unregistered external traffic fails loudly in fast tests."""

import socket

import pytest


def test_unexpected_socket_connection_blocked_with_diagnostic():
    with pytest.raises(RuntimeError, match="P01 network guard"):
        socket.create_connection(("203.0.1.99", 80), timeout=0.1)


@pytest.mark.anyio
async def test_asgi_transport_still_works_under_guard(api_client):
    response = await api_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

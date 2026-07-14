from unittest.mock import MagicMock, patch

from app.source_connection import check_database_connection


def test_mysql_source_uses_mysql_driver_and_select_one():
    current = MagicMock()
    cursor = current.cursor.return_value.__enter__.return_value
    with patch("app.source_connection.pymysql.connect", return_value=current) as connect:
        check_database_connection(
            {
                "host": "mysql.example",
                "port": 3306,
                "database_name": "measurement",
                "username": "reader",
                "connection_options_json": {"dialect": "mysql"},
                "security_config_json": {"encryptionEnabled": True},
            },
            "secret",
            8,
        )

    connect.assert_called_once_with(
        host="mysql.example",
        port=3306,
        user="reader",
        password="secret",
        database="measurement",
        connect_timeout=8,
        read_timeout=8,
        write_timeout=8,
        charset="utf8mb4",
        autocommit=True,
        ssl={"check_hostname": False},
    )
    assert [call.args[0] for call in cursor.execute.call_args_list] == [
        "SELECT 1",
        "SHOW STATUS LIKE 'Ssl_cipher'",
    ]
    current.close.assert_called_once()

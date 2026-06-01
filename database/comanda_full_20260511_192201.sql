-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: comanda
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `comanda`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `comanda` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `comanda`;

--
-- Table structure for table `caja_sesiones`
--

DROP TABLE IF EXISTS `caja_sesiones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caja_sesiones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `abierta_en` datetime NOT NULL,
  `cerrada_en` datetime DEFAULT NULL,
  `monto_inicial` decimal(12,2) NOT NULL DEFAULT 0.00,
  `monto_final_declarado` decimal(12,2) DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'abierta',
  `notas` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_caja_usuario` (`usuario_id`),
  CONSTRAINT `fk_caja_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caja_sesiones`
--

LOCK TABLES `caja_sesiones` WRITE;
/*!40000 ALTER TABLE `caja_sesiones` DISABLE KEYS */;
INSERT INTO `caja_sesiones` VALUES (1,1,'2026-03-30 16:50:48','2026-03-30 16:51:03',12000.00,12000.00,'cerrada','cierre de prueba'),(2,5,'2026-03-30 16:51:47','2026-03-30 17:37:23',0.00,2000.00,'cerrada',''),(3,5,'2026-03-30 17:37:28','2026-04-10 14:39:43',0.00,19000.00,'cerrada',''),(4,1,'2026-04-10 14:39:51','2026-04-10 14:39:56',0.00,0.00,'cerrada',''),(5,1,'2026-04-10 14:40:13','2026-04-10 17:49:54',0.00,18600.00,'cerrada',''),(6,5,'2026-04-10 18:05:35','2026-04-10 18:05:56',2000.00,2000.00,'cerrada',''),(7,5,'2026-04-10 18:05:58','2026-04-10 18:06:03',0.00,0.00,'cerrada',''),(8,5,'2026-04-10 18:06:18','2026-04-10 18:31:06',0.00,3500.00,'cerrada',''),(9,5,'2026-04-10 18:31:07',NULL,0.00,NULL,'abierta','');
/*!40000 ALTER TABLE `caja_sesiones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comanda_items`
--

DROP TABLE IF EXISTS `comanda_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comanda_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `comanda_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned DEFAULT NULL,
  `descripcion` varchar(255) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `precio_unitario` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `notas` text DEFAULT NULL,
  `creado_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comanda_items_comanda` (`comanda_id`),
  KEY `idx_comanda_items_producto` (`producto_id`),
  CONSTRAINT `fk_comanda_items_comanda` FOREIGN KEY (`comanda_id`) REFERENCES `comandas` (`id`),
  CONSTRAINT `fk_comanda_items_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comanda_items`
--

LOCK TABLES `comanda_items` WRITE;
/*!40000 ALTER TABLE `comanda_items` DISABLE KEYS */;
INSERT INTO `comanda_items` VALUES (1,1,9,'Bebida 350ml',1,1500.00,1500.00,'','2026-03-30 14:38:39'),(2,1,7,'Ensalada Chilena',1,2800.00,2800.00,'','2026-03-30 14:38:39'),(3,1,1,'Cazuela de Vacuno',1,6500.00,6500.00,'','2026-03-30 14:38:39'),(4,1,11,'Leche Asada',1,2600.00,2600.00,'','2026-03-30 15:26:46'),(5,2,3,'Porotos Granados',1,5900.00,5900.00,'','2026-03-30 16:53:08'),(6,3,9,'Bebida 350ml',2,1500.00,3000.00,'','2026-03-30 17:01:05'),(7,3,5,'Empanada de Pino',1,2200.00,2200.00,'','2026-03-30 17:01:05'),(8,3,6,'Humita',1,2500.00,2500.00,'','2026-03-30 17:01:05'),(9,3,4,'Carbonada',2,6100.00,12200.00,'','2026-03-30 17:01:05'),(10,4,10,'Agua Mineral',1,1300.00,1300.00,'','2026-03-30 17:39:11'),(11,4,5,'Empanada de Pino',1,2200.00,2200.00,'','2026-03-30 17:39:11'),(12,5,13,'redbull 330cc',1,2500.00,2500.00,'','2026-03-31 04:45:20'),(13,5,7,'Ensalada Chilena',1,2800.00,2800.00,'','2026-03-31 04:45:20'),(14,5,4,'Carbonada',1,6100.00,6100.00,'','2026-03-31 04:45:20'),(15,5,11,'Leche Asada',1,2600.00,2600.00,'','2026-03-31 04:45:20'),(16,5,9,'Bebida 350ml',1,1500.00,1500.00,'','2026-03-31 04:46:03'),(17,6,10,'Agua Mineral',1,1300.00,1300.00,'','2026-04-10 14:44:13'),(18,6,7,'Ensalada Chilena',1,2800.00,2800.00,'','2026-04-10 14:44:13'),(19,6,1,'Cazuela de Vacuno',1,6500.00,6500.00,'','2026-04-10 14:44:13'),(20,6,13,'redbull 330cc',1,2500.00,2500.00,'','2026-04-10 14:44:13'),(21,6,11,'Leche Asada',1,2600.00,2600.00,'','2026-04-10 14:44:13'),(22,6,12,'Mote con Huesillos',1,2900.00,2900.00,'','2026-04-10 14:44:13'),(23,7,10,'Agua Mineral',1,1300.00,1300.00,'','2026-04-10 17:29:03'),(24,7,5,'Empanada de Pino',1,2200.00,2200.00,'','2026-04-10 17:29:03'),(25,8,10,'Agua Mineral',1,1300.00,1300.00,'','2026-04-10 18:32:26'),(26,8,5,'Empanada de Pino',1,2200.00,2200.00,'','2026-04-10 18:32:26'),(27,9,1,'Cazuela de Vacuno',1,6500.00,6500.00,'','2026-04-26 01:02:31');
/*!40000 ALTER TABLE `comanda_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comandas`
--

DROP TABLE IF EXISTS `comandas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comandas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `mesa_id` int(10) unsigned NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'abierta',
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `creada_en` datetime NOT NULL,
  `actualizada_en` datetime NOT NULL,
  `cerrada_en` datetime DEFAULT NULL,
  `propina_monto` decimal(12,2) NOT NULL DEFAULT 0.00,
  `propina_porcentaje` decimal(5,2) NOT NULL DEFAULT 10.00,
  `mesero_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comandas_mesa_estado` (`mesa_id`,`estado`),
  CONSTRAINT `fk_comandas_mesa` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comandas`
--

LOCK TABLES `comandas` WRITE;
/*!40000 ALTER TABLE `comandas` DISABLE KEYS */;
INSERT INTO `comandas` VALUES (1,1,'cerrada',13400.00,'2026-03-30 14:38:39','2026-03-30 16:39:29','2026-03-30 16:39:29',0.00,10.00,NULL),(2,6,'cerrada',5900.00,'2026-03-30 16:53:08','2026-03-30 17:22:36','2026-03-30 17:22:36',0.00,10.00,NULL),(3,3,'cerrada',19900.00,'2026-03-30 17:01:05','2026-03-30 17:08:56','2026-03-30 17:08:56',0.00,10.00,NULL),(4,1,'cerrada',3500.00,'2026-03-30 17:39:11','2026-03-30 19:45:51','2026-03-30 19:45:51',0.00,10.00,NULL),(5,8,'cerrada',15500.00,'2026-03-31 04:45:20','2026-04-10 14:39:36','2026-04-10 14:39:36',1550.00,10.00,1),(6,1,'cerrada',18600.00,'2026-04-10 14:44:13','2026-04-10 14:44:33','2026-04-10 14:44:33',2000.00,10.00,4),(7,1,'cerrada',3500.00,'2026-04-10 17:29:03','2026-04-10 18:25:07','2026-04-10 18:25:07',350.00,10.00,4),(8,3,'abierta',3500.00,'2026-04-10 18:32:26','2026-04-10 18:32:26',NULL,0.00,10.00,4),(9,1,'cerrada',6500.00,'2026-04-26 01:02:31','2026-04-26 01:02:32','2026-04-26 01:02:32',0.00,10.00,1);
/*!40000 ALTER TABLE `comandas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuraciones`
--

DROP TABLE IF EXISTS `configuraciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `configuraciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(120) NOT NULL,
  `valor` text NOT NULL,
  `actualizada_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_configuraciones_clave` (`clave`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuraciones`
--

LOCK TABLES `configuraciones` WRITE;
/*!40000 ALTER TABLE `configuraciones` DISABLE KEYS */;
INSERT INTO `configuraciones` VALUES (1,'nombre_local','Donde Abel','2026-03-30 17:48:53'),(2,'moneda_simbolo','$','2026-03-30 17:48:53'),(3,'imprimir_pedidos','1','2026-03-30 17:48:53'),(4,'impresora_modo','una','2026-03-30 16:38:40'),(5,'impresora_cocina','XP-58','2026-03-30 16:38:40'),(6,'impresora_caja','XP-58','2026-03-30 16:38:40'),(7,'mesas_cantidad','10','2026-04-26 01:03:45'),(8,'ticket_papel_mm','58','2026-03-30 16:38:40'),(9,'ticket_ancho_chars','32','2026-03-30 16:38:40'),(10,'ticket_fuente_pt','9','2026-03-30 16:38:40'),(11,'alerta_sonido_activo','1','2026-03-30 17:48:53'),(12,'alerta_tono_comanda','tono_1','2026-03-30 17:48:53'),(13,'propina_habilitada','1','2026-03-31 04:55:16'),(14,'propina_porcentaje','10','2026-03-31 04:55:16');
/*!40000 ALTER TABLE `configuraciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `impresiones`
--

DROP TABLE IF EXISTS `impresiones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `impresiones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `comanda_id` int(10) unsigned NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `estado` varchar(30) NOT NULL,
  `detalle` text DEFAULT NULL,
  `creada_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_impresiones_comanda` (`comanda_id`),
  CONSTRAINT `fk_impresiones_comanda` FOREIGN KEY (`comanda_id`) REFERENCES `comandas` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `impresiones`
--

LOCK TABLES `impresiones` WRITE;
/*!40000 ALTER TABLE `impresiones` DISABLE KEYS */;
INSERT INTO `impresiones` VALUES (1,1,'pedido','fallida','Servicio de impresion respondio HTTP 404.','2026-03-30 14:38:39'),(2,1,'precuenta','fallida','Servicio de impresion respondio HTTP 404.','2026-03-30 14:38:54'),(3,1,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: L4150 Series(Network)','2026-03-30 15:23:23'),(4,1,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: L4150 Series(Network)','2026-03-30 15:25:28'),(5,1,'pedido','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 15:26:46'),(6,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 15:27:40'),(7,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 15:27:57'),(8,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir. Custom: No se pudo imprimir en modo termico: Impresora no valida o no instalada.\r\nEn l�nea: 1 Car�cter: 640\r\n+ ... ttings.IsValid) { throw \'Impresora no valida o no instalada.\' }; $pap ...\r\n+                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : OperationStopped: (Impresora no valida o no instalada.:String) [], RuntimeException\r\n    + FullyQualifiedErrorId : Impresora no valida o no instalada.\r\n \r\n. Fallback: No se pudo imprimir con Out-Printer: out-lineoutput : La configuraci�n para obtener acceso a la impresora \'NO_EXISTE_58\' no es v�lida.\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], InvalidPrinterException\r\n    + FullyQualifiedErrorId : System.Drawing.Printing.InvalidPrinterException,Microsoft.PowerShell.Commands.OutLineOut \r\n   putCommand\r\n \r\n | Impresora: NO_EXISTE_58','2026-03-30 15:36:51'),(9,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir. Custom: No se pudo imprimir en modo termico: Excepci�n al llamar a \"Print\" con los argumentos \"0\": \"El t�rmino \'param\' no se reconoce como nombre de un cmdlet, \r\nfunci�n, archivo de script o programa ejecutable. Compruebe si escribi� correctamente el nombre o, si incluy� una ruta \r\nde acceso, compruebe que dicha ruta es correcta e int�ntelo de nuevo.\"\r\nEn l�nea: 1 Car�cter: 1664\r\n+ ... rue; return; }; }; $e.HasMorePages = $false; }); $doc.Print(); $doc.D ...\r\n+                                                      ~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException\r\n    + FullyQualifiedErrorId : CommandNotFoundException\r\n \r\n. Fallback: No se pudo imprimir con Out-Printer: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 16:09:28'),(10,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir. Custom: No se pudo imprimir en modo termico: Excepci�n al llamar a \"Print\" con los argumentos \"0\": \"El t�rmino \'param\' no se reconoce como nombre de un cmdlet, \r\nfunci�n, archivo de script o programa ejecutable. Compruebe si escribi� correctamente el nombre o, si incluy� una ruta \r\nde acceso, compruebe que dicha ruta es correcta e int�ntelo de nuevo.\"\r\nEn l�nea: 1 Car�cter: 1665\r\n+ ... rue; return; }; }; $e.HasMorePages = $false; }); $doc.Print(); $doc.D ...\r\n+                                                      ~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException\r\n    + FullyQualifiedErrorId : CommandNotFoundException\r\n \r\n. Fallback: No se pudo imprimir con Out-Printer: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 16:10:10'),(11,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir. Custom: No se pudo imprimir en modo termico: Excepci�n al llamar a \"Print\" con los argumentos \"0\": \"El t�rmino \'param\' no se reconoce como nombre de un cmdlet, \r\nfunci�n, archivo de script o programa ejecutable. Compruebe si escribi� correctamente el nombre o, si incluy� una ruta \r\nde acceso, compruebe que dicha ruta es correcta e int�ntelo de nuevo.\"\r\nEn l�nea: 1 Car�cter: 1665\r\n+ ... rue; return; }; }; $e.HasMorePages = $false; }); $doc.Print(); $doc.D ...\r\n+                                                      ~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException\r\n    + FullyQualifiedErrorId : CommandNotFoundException\r\n \r\n. Fallback: No se pudo imprimir con Out-Printer: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 16:10:24'),(12,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir. Custom: No se pudo imprimir en modo termico: Excepci�n al llamar a \"Print\" con los argumentos \"0\": \"El t�rmino \'param\' no se reconoce como nombre de un cmdlet, \r\nfunci�n, archivo de script o programa ejecutable. Compruebe si escribi� correctamente el nombre o, si incluy� una ruta \r\nde acceso, compruebe que dicha ruta es correcta e int�ntelo de nuevo.\"\r\nEn l�nea: 1 Car�cter: 1665\r\n+ ... rue; return; }; }; $e.HasMorePages = $false; }); $doc.Print(); $doc.D ...\r\n+                                                      ~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException\r\n    + FullyQualifiedErrorId : CommandNotFoundException\r\n \r\n. Fallback: No se pudo imprimir con Out-Printer: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 16:10:36'),(13,1,'precuenta','fallida','Servicio de impresion respondio HTTP 500. No se pudo imprimir. Custom: No se pudo imprimir en modo termico: Excepci�n al llamar a \"Print\" con los argumentos \"0\": \"El t�rmino \'param\' no se reconoce como nombre de un cmdlet, \r\nfunci�n, archivo de script o programa ejecutable. Compruebe si escribi� correctamente el nombre o, si incluy� una ruta \r\nde acceso, compruebe que dicha ruta es correcta e int�ntelo de nuevo.\"\r\nEn l�nea: 1 Car�cter: 1665\r\n+ ... rue; return; }; }; $e.HasMorePages = $false; }); $doc.Print(); $doc.D ...\r\n+                                                      ~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException\r\n    + FullyQualifiedErrorId : CommandNotFoundException\r\n \r\n. Fallback: No se pudo imprimir con Out-Printer: out-lineoutput : La longitud no puede ser inferior a cero.\r\nNombre del par�metro: length\r\nEn l�nea: 1 Car�cter: 1\r\n+ Get-Content -LiteralPath \'C:\\xampp\\htdocs\\comanda\\print_jobs\\20260330 ...\r\n+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : NotSpecified: (:) [out-lineoutput], ArgumentOutOfRangeException\r\n    + FullyQualifiedErrorId : System.ArgumentOutOfRangeException,Microsoft.PowerShell.Commands.OutLineOutputCommand\r\n \r\n | Impresora: XP-58','2026-03-30 16:11:27'),(14,1,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 16:11:59'),(15,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2008 ms: Timeout was reached','2026-03-30 16:13:53'),(16,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2015 ms: Timeout was reached','2026-03-30 16:14:06'),(17,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2012 ms: Timeout was reached','2026-03-30 16:20:03'),(18,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2013 ms: Timeout was reached','2026-03-30 16:35:30'),(19,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2006 ms: Couldn\'t connect to server','2026-03-30 16:35:36'),(20,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2026 ms: Timeout was reached','2026-03-30 16:35:42'),(21,1,'precuenta','fallida','No se pudo conectar al servicio de impresion: Failed to connect to 127.0.0.1 port 7357 after 2004 ms: Timeout was reached','2026-03-30 16:36:06'),(22,1,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 16:36:48'),(23,1,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 16:37:54'),(24,1,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 16:39:29'),(25,2,'pedido','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 16:53:08'),(26,3,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:01:05'),(27,3,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:01:06'),(28,2,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:02:07'),(29,3,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:08:38'),(30,3,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:08:56'),(31,2,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:22:36'),(32,4,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:39:11'),(33,4,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 17:39:12'),(34,4,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 19:45:40'),(35,4,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-30 19:45:51'),(36,5,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-31 04:45:20'),(37,5,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-31 04:45:21'),(38,5,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-03-31 04:46:03'),(39,5,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 14:39:36'),(40,6,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 14:44:13'),(41,6,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 14:44:14'),(42,6,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 14:44:33'),(43,7,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 17:29:03'),(44,7,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 17:29:04'),(45,7,'precuenta','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 18:24:55'),(46,7,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 18:25:07'),(47,8,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 18:32:26'),(48,8,'pedido_bebestibles','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-10 18:32:26'),(49,9,'pedido_cocina','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-26 01:02:31'),(50,9,'ticket','enviada','Ticket enviado a la impresora local. | Impresora: XP-58','2026-04-26 01:02:32');
/*!40000 ALTER TABLE `impresiones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `menu_diario_confirmaciones`
--

DROP TABLE IF EXISTS `menu_diario_confirmaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `menu_diario_confirmaciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `confirmado_por` int(10) unsigned DEFAULT NULL,
  `confirmado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_menu_confirmacion_fecha` (`fecha`),
  KEY `idx_menu_confirmacion_usuario` (`confirmado_por`),
  CONSTRAINT `fk_menu_confirmacion_usuario` FOREIGN KEY (`confirmado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_diario_confirmaciones`
--

LOCK TABLES `menu_diario_confirmaciones` WRITE;
/*!40000 ALTER TABLE `menu_diario_confirmaciones` DISABLE KEYS */;
INSERT INTO `menu_diario_confirmaciones` VALUES (1,'2026-03-31',1,'2026-03-31 04:43:15'),(2,'2026-04-10',1,'2026-04-10 18:07:57');
/*!40000 ALTER TABLE `menu_diario_confirmaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `menu_diario_items`
--

DROP TABLE IF EXISTS `menu_diario_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `menu_diario_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `producto_id` int(10) unsigned NOT NULL,
  `habilitado` tinyint(1) NOT NULL DEFAULT 1,
  `confirmado_por` int(10) unsigned DEFAULT NULL,
  `confirmado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_menu_diario_fecha_producto` (`fecha`,`producto_id`),
  KEY `idx_menu_diario_producto` (`producto_id`),
  KEY `idx_menu_diario_confirmado_por` (`confirmado_por`),
  CONSTRAINT `fk_menu_diario_confirmado_por` FOREIGN KEY (`confirmado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_menu_diario_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_diario_items`
--

LOCK TABLES `menu_diario_items` WRITE;
/*!40000 ALTER TABLE `menu_diario_items` DISABLE KEYS */;
INSERT INTO `menu_diario_items` VALUES (1,'2026-03-31',10,1,1,'2026-03-31 04:43:15'),(2,'2026-03-31',9,1,1,'2026-03-31 04:43:15'),(3,'2026-03-31',8,1,1,'2026-03-31 04:43:15'),(4,'2026-03-31',13,1,1,'2026-03-31 04:43:15'),(5,'2026-03-31',5,1,1,'2026-03-31 04:43:15'),(6,'2026-03-31',7,1,1,'2026-03-31 04:43:15'),(7,'2026-03-31',6,1,1,'2026-03-31 04:43:15'),(8,'2026-03-31',4,1,1,'2026-03-31 04:43:15'),(9,'2026-03-31',1,1,1,'2026-03-31 04:43:15'),(10,'2026-03-31',2,1,1,'2026-03-31 04:43:15'),(11,'2026-03-31',3,1,1,'2026-03-31 04:43:15'),(12,'2026-03-31',11,1,1,'2026-03-31 04:43:15'),(13,'2026-03-31',12,1,1,'2026-03-31 04:43:15'),(14,'2026-04-10',10,1,1,'2026-04-10 18:07:57'),(15,'2026-04-10',9,1,1,'2026-04-10 18:07:57'),(16,'2026-04-10',8,1,1,'2026-04-10 18:07:57'),(17,'2026-04-10',13,1,1,'2026-04-10 18:07:57'),(18,'2026-04-10',5,1,1,'2026-04-10 18:07:57'),(19,'2026-04-10',7,1,1,'2026-04-10 18:07:57'),(20,'2026-04-10',6,1,1,'2026-04-10 18:07:57'),(21,'2026-04-10',4,1,1,'2026-04-10 18:07:57'),(22,'2026-04-10',1,1,1,'2026-04-10 18:07:57'),(23,'2026-04-10',2,1,1,'2026-04-10 18:07:57'),(24,'2026-04-10',3,1,1,'2026-04-10 18:07:57'),(25,'2026-04-10',11,1,1,'2026-04-10 18:07:57'),(26,'2026-04-10',12,1,1,'2026-04-10 18:07:57');
/*!40000 ALTER TABLE `menu_diario_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mesas`
--

DROP TABLE IF EXISTS `mesas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mesas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `numero` int(11) NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'libre',
  `actualizada_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mesas_numero` (`numero`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mesas`
--

LOCK TABLES `mesas` WRITE;
/*!40000 ALTER TABLE `mesas` DISABLE KEYS */;
INSERT INTO `mesas` VALUES (1,1,'libre','2026-04-26 01:02:32'),(2,2,'libre','2026-03-30 13:53:55'),(3,3,'ocupada','2026-04-10 18:32:26'),(4,4,'libre','2026-03-30 13:53:55'),(5,5,'libre','2026-03-30 13:53:55'),(6,6,'libre','2026-03-30 17:22:36'),(7,7,'libre','2026-03-30 13:53:55'),(8,8,'libre','2026-04-10 14:39:36'),(9,9,'libre','2026-03-30 13:53:55'),(10,10,'libre','2026-03-30 13:53:55'),(11,11,'libre','2026-03-30 13:53:55'),(12,12,'libre','2026-03-30 13:53:55'),(13,13,'libre','2026-03-30 13:53:55'),(14,14,'libre','2026-03-30 13:53:55'),(15,15,'libre','2026-03-30 13:53:55'),(16,16,'libre','2026-03-30 13:53:55'),(17,17,'libre','2026-03-30 13:53:55'),(18,18,'libre','2026-03-30 13:53:55'),(19,19,'libre','2026-03-30 13:53:55'),(20,20,'libre','2026-03-30 13:53:55');
/*!40000 ALTER TABLE `mesas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pagos`
--

DROP TABLE IF EXISTS `pagos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pagos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `comanda_id` int(10) unsigned NOT NULL,
  `metodo` varchar(30) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `creado_en` datetime NOT NULL,
  `usuario_id` int(10) unsigned DEFAULT NULL,
  `caja_sesion_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pagos_comanda` (`comanda_id`),
  KEY `fk_pagos_usuario` (`usuario_id`),
  CONSTRAINT `fk_pagos_comanda` FOREIGN KEY (`comanda_id`) REFERENCES `comandas` (`id`),
  CONSTRAINT `fk_pagos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pagos`
--

LOCK TABLES `pagos` WRITE;
/*!40000 ALTER TABLE `pagos` DISABLE KEYS */;
INSERT INTO `pagos` VALUES (1,1,'efectivo',13400.00,'2026-03-30 16:39:29',NULL,NULL),(2,3,'tarjeta',19900.00,'2026-03-30 17:08:56',5,2),(3,2,'efectivo',2000.00,'2026-03-30 17:22:36',5,2),(4,2,'tarjeta',900.00,'2026-03-30 17:22:36',5,2),(5,2,'transferencia',3000.00,'2026-03-30 17:22:36',5,2),(6,4,'efectivo',3500.00,'2026-03-30 19:45:51',5,3),(7,5,'efectivo',15500.00,'2026-04-10 14:39:36',1,3),(8,6,'efectivo',18600.00,'2026-04-10 14:44:33',1,5),(9,7,'efectivo',3500.00,'2026-04-10 18:25:07',5,8),(10,9,'efectivo',6500.00,'2026-04-26 01:02:32',1,9);
/*!40000 ALTER TABLE `pagos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `productos`
--

DROP TABLE IF EXISTS `productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `productos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(190) NOT NULL,
  `categoria` varchar(50) NOT NULL,
  `precio` decimal(12,2) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `productos`
--

LOCK TABLES `productos` WRITE;
/*!40000 ALTER TABLE `productos` DISABLE KEYS */;
INSERT INTO `productos` VALUES (1,'Cazuela de Vacuno','Platos',6500.00,1),(2,'Pastel de Choclo','Platos',6200.00,1),(3,'Porotos Granados','Platos',5900.00,1),(4,'Carbonada','Platos',6100.00,1),(5,'Empanada de Pino','Platos',2200.00,1),(6,'Humita','Platos',2500.00,1),(7,'Ensalada Chilena','Platos',2800.00,1),(8,'Jugo Natural','Bebidas',1800.00,1),(9,'Bebida 350ml','Bebidas',1500.00,1),(10,'Agua Mineral','Bebidas',1300.00,1),(11,'Ensalada','Agregados',0.00,1),(12,'Arroz','Agregados',0.00,1),(13,'Papas Fritas','Agregados',0.00,1),(14,'redbull 330cc','Bebidas',2500.00,1);
/*!40000 ALTER TABLE `productos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) NOT NULL,
  `usuario` varchar(120) NOT NULL,
  `rol` varchar(30) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `alertas_nuevas_comandas` tinyint(1) DEFAULT 1,
  `creado_en` datetime NOT NULL,
  `actualizado_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_usuario` (`usuario`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,'Administrador','admin','admin','$2y$10$PMmuSj.S6gfLeH1a5W.6huV3V81C7mLLfx/0gKwr9im/io2pPR/82',1,1,'2026-03-30 14:49:50','2026-04-26 01:03:56'),(4,'noteiza','noteiza','mesero','$2y$10$pYvPkzyt46Sny7jQT5ZwMuEXAjDgJIx0bypNBlkSkDmrdtMVvkaWe',1,1,'2026-03-30 15:24:31','2026-04-10 14:42:58'),(5,'caja','caja','caja','$2y$10$7aYZOrME0QvW1K6qVG5cyu1SmHEHYS.z/rJ0r.cV2Px06xd2y7z5K',1,1,'2026-03-30 16:40:40','2026-04-10 14:45:12');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'comanda'
--

--
-- Dumping routines for database 'comanda'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-11 19:22:07

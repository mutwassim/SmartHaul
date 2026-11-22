import 'package:flutter/material.dart';

import 'app.dart';
import 'core/app_services.dart';
import 'core/services/firebase_push_token_source.dart';
import 'core/services/push_notification_service.dart';
import 'core/storage/session_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PushNotificationService.instance.initialize();
  final store = await SessionStore.open();
  final services = AppServices.create(store, push: const FirebasePushTokenSource());
  runApp(SmartHaulApp(services: services));
}
